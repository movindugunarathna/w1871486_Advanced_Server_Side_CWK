(function() {
  'use strict';

  window.charts = {};

  var COLORS = [
    '#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0',
    '#6f42c1', '#fd7e14', '#20c997', '#d63384', '#6610f2',
    '#adb5bd', '#495057', '#0b5ed7', '#157347', '#b02a37'
  ];

  // Severity colour bands for skill-gap / job-title bar charts.
  // Critical (red) = top 30% of max, Significant (orange) = top 60%, Emerging (yellow) = rest.
  function severityColors(counts) {
    if (!counts || !counts.length) return [];
    var max = Math.max.apply(null, counts);
    return counts.map(function(c) {
      var ratio = max > 0 ? c / max : 0;
      if (ratio >= 0.7) return '#dc3545';   // critical — red
      if (ratio >= 0.4) return '#fd7e14';   // significant — orange
      return '#ffc107';                      // emerging — yellow
    });
  }

  // ─── Helpers ───

  function apiFetch(proxyPath, params) {
    var url = new URL(proxyPath, window.location.origin);
    if (params) {
      Object.keys(params).forEach(function(k) {
        if (params[k] !== '' && params[k] != null) {
          url.searchParams.set(k, params[k]);
        }
      });
    }
    // Add a cache-busting timestamp so dashboard chart calls always hit fresh data.
    url.searchParams.set('_t', Date.now());
    return fetch(url.toString(), { cache: 'no-store' }).then(function(res) {
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    });
  }

  function expectedMimeForFilename(filename) {
    var lower = String(filename || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.csv')) return 'text/csv';
    return '';
  }

  function isExpectedDownloadResponse(expectedMime, contentType, contentDisposition) {
    if (!expectedMime) return true;
    var type = String(contentType || '').toLowerCase();
    var disposition = String(contentDisposition || '').toLowerCase();
    var looksLikeAttachment = disposition.indexOf('attachment') !== -1;

    if (expectedMime === 'application/pdf') {
      return type.indexOf('application/pdf') !== -1 ||
        (looksLikeAttachment && disposition.indexOf('.pdf') !== -1) ||
        (looksLikeAttachment && type.indexOf('application/octet-stream') !== -1);
    }

    if (expectedMime === 'text/csv') {
      return type.indexOf('text/csv') !== -1 ||
        type.indexOf('application/csv') !== -1 ||
        (looksLikeAttachment && disposition.indexOf('.csv') !== -1) ||
        (looksLikeAttachment && type.indexOf('application/octet-stream') !== -1);
    }

    return false;
  }

  function downloadFile(proxyExportPath, filename) {
    var expectedMime = expectedMimeForFilename(filename);
    return fetch(proxyExportPath, { credentials: 'same-origin' }).then(function(res) {
      if (res.redirected && /\/dashboard\/login(?:\?|$)/.test(res.url || '')) {
        throw new Error('Session expired. Please log in again.');
      }
      if (!res.ok) {
        // Try to extract the JSON error message the server sends.
        return res.text().then(function(text) {
          var msg = 'Export failed (' + res.status + ')';
          try {
            var body = JSON.parse(text);
            if (body && body.message) msg = body.message;
          } catch (e) { /* not JSON */ }
          throw new Error(msg);
        });
      }
      var contentType = String(res.headers.get('content-type') || '').toLowerCase();
      var contentDisposition = String(res.headers.get('content-disposition') || '').toLowerCase();
      if (!isExpectedDownloadResponse(expectedMime, contentType, contentDisposition)) {
        return res.text().then(function(text) {
          var msg = 'Unexpected export response';
          try {
            var body = JSON.parse(text);
            if (body && body.message) msg = body.message;
          } catch (e) {
            if (text && text.trim()) msg = text.trim().slice(0, 200);
          }
          throw new Error(msg);
        });
      }
      return res.blob();
    }).then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function withQueryParams(path, params) {
    var url = new URL(path, window.location.origin);
    Object.keys(params || {}).forEach(function(key) {
      if (params[key] !== '' && params[key] != null) {
        url.searchParams.set(key, params[key]);
      }
    });
    return url.pathname + url.search;
  }

  function hideSpinner(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (canvas) {
      var container = canvas.parentElement;
      var spinner = container.querySelector('.chart-spinner');
      if (spinner) spinner.style.display = 'none';
    }
  }

  function showError(canvasId, message) {
    var canvas = document.getElementById(canvasId);
    if (canvas) {
      var container = canvas.parentElement;
      hideSpinner(canvasId.replace('Chart', ''));
      var alert = document.createElement('div');
      alert.className = 'alert alert-warning mt-2';
      alert.textContent = message || 'Failed to load chart data';
      container.appendChild(alert);
    }
  }

  function destroyChart(name) {
    if (window.charts[name]) {
      window.charts[name].destroy();
      window.charts[name] = null;
    }
  }

  function getFilters(formId) {
    var form = document.getElementById(formId);
    if (!form) return {};
    var fd = new FormData(form);
    var obj = {};
    fd.forEach(function(val, key) { obj[key] = val; });
    return obj;
  }

  // ─── Chart rendering functions ───

  function renderCertificationsChart(filters) {
    hideSpinner('certificationsChart');
    apiFetch('/dashboard/proxy/analytics/skills-gap', filters).then(function(res) {
      var items = (res.data && res.data.certifications) ? res.data.certifications.slice(0, 10) : [];
      destroyChart('certifications');
      var ctx = document.getElementById('certificationsChart');
      if (!ctx) return;
      var counts = items.map(function(c) { return c.count; });
      window.charts.certifications = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: items.map(function(c) { return c.name; }),
          datasets: [{
            label: 'Count',
            data: counts,
            backgroundColor: severityColors(counts)
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: function(ctx) {
                  var ratio = counts.length ? ctx.parsed.y / Math.max.apply(null, counts) : 0;
                  if (ratio >= 0.7) return 'Severity: Critical';
                  if (ratio >= 0.4) return 'Severity: Significant';
                  return 'Severity: Emerging';
                }
              }
            }
          }
        }
      });
    }).catch(function() { showError('certificationsChart', 'Failed to load certifications'); });
  }

  function renderCoursesChart(filters) {
    hideSpinner('coursesChart');
    apiFetch('/dashboard/proxy/analytics/skills-gap', filters).then(function(res) {
      var items = (res.data && res.data.professionalCourses) ? res.data.professionalCourses.slice(0, 10) : [];
      destroyChart('courses');
      var ctx = document.getElementById('coursesChart');
      if (!ctx) return;
      window.charts.courses = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: items.map(function(c) { return c.name; }),
          datasets: [{
            label: 'Count',
            data: items.map(function(c) { return c.count; }),
            backgroundColor: COLORS.slice(0, items.length)
          }]
        },
        options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } } }
      });
    }).catch(function() { showError('coursesChart', 'Failed to load courses'); });
  }

  function renderSectorChart(filters) {
    hideSpinner('sectorChart');
    apiFetch('/dashboard/proxy/analytics/employment-by-sector', filters).then(function(res) {
      var items = (res.data && res.data.sectors) ? res.data.sectors.slice(0, 10) : [];
      destroyChart('sector');
      var ctx = document.getElementById('sectorChart');
      if (!ctx) return;
      window.charts.sector = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: items.map(function(s) { return s.sector; }),
          datasets: [{
            data: items.map(function(s) { return s.alumniCount; }),
            backgroundColor: COLORS.slice(0, items.length)
          }]
        },
        options: { responsive: true }
      });
    }).catch(function() { showError('sectorChart', 'Failed to load sector data'); });
  }

  function renderCertTrendChart(filters) {
    hideSpinner('certTrendChart');
    apiFetch('/dashboard/proxy/analytics/career-trends', filters).then(function(res) {
      var items = (res.data && res.data.certificationsByMonth) ? res.data.certificationsByMonth : [];
      destroyChart('certTrend');
      var ctx = document.getElementById('certTrendChart');
      if (!ctx) return;
      window.charts.certTrend = new Chart(ctx, {
        type: 'line',
        data: {
          labels: items.map(function(i) { return i.month; }),
          datasets: [{
            label: 'Certifications',
            data: items.map(function(i) { return i.count; }),
            borderColor: '#0d6efd',
            backgroundColor: 'rgba(13,110,253,0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: { responsive: true }
      });
    }).catch(function() { showError('certTrendChart', 'Failed to load trends'); });
  }

  function renderEmployersChart(filters) {
    hideSpinner('employersChart');
    var params = Object.assign({}, filters, { limit: 6 });
    apiFetch('/dashboard/proxy/analytics/top-employers', params).then(function(res) {
      var items = (res.data && res.data.employers) ? res.data.employers : [];
      destroyChart('employers');
      var ctx = document.getElementById('employersChart');
      if (!ctx) return;
      window.charts.employers = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: items.map(function(e) { return e.company; }),
          datasets: [{
            label: 'Alumni Count',
            data: items.map(function(e) { return e.alumniCount; }),
            borderColor: '#6f42c1',
            backgroundColor: 'rgba(111,66,193,0.2)'
          }]
        },
        options: { responsive: true }
      });
    }).catch(function() { showError('employersChart', 'Failed to load employers'); });
  }

  function renderCompletionChart(filters) {
    hideSpinner('completionChart');
    apiFetch('/dashboard/proxy/analytics/profile-completion-rate', filters).then(function(res) {
      var d = res.data || {};
      destroyChart('completion');
      var ctx = document.getElementById('completionChart');
      if (!ctx) return;
      window.charts.completion = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Complete', 'Incomplete'],
          datasets: [{
            data: [d.complete || 0, d.incomplete || 0],
            backgroundColor: ['#198754', '#dc3545']
          }]
        },
        options: { responsive: true }
      });
    }).catch(function() { showError('completionChart', 'Failed to load completion data'); });
  }

  function renderJobTitlesChart(filters) {
    hideSpinner('jobTitlesChart');
    apiFetch('/dashboard/proxy/analytics/job-titles', filters).then(function(res) {
      var items = (res.data && res.data.jobTitles) ? res.data.jobTitles.slice(0, 15) : [];
      destroyChart('jobTitles');
      var ctx = document.getElementById('jobTitlesChart');
      if (!ctx) return;
      var counts = items.map(function(j) { return j.count; });
      window.charts.jobTitles = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: items.map(function(j) { return j.title; }),
          datasets: [{
            label: 'Count',
            data: counts,
            backgroundColor: severityColors(counts)
          }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }).catch(function() { showError('jobTitlesChart', 'Failed to load job titles'); });
  }

  function renderFeaturedTrendChart(filters) {
    hideSpinner('featuredTrendChart');
    apiFetch('/dashboard/proxy/analytics/career-trends', filters).then(function(res) {
      var items = (res.data && res.data.featuredAlumniByMonth) ? res.data.featuredAlumniByMonth : [];
      destroyChart('featuredTrend');
      var ctx = document.getElementById('featuredTrendChart');
      if (!ctx) return;
      window.charts.featuredTrend = new Chart(ctx, {
        type: 'line',
        data: {
          labels: items.map(function(i) { return i.month; }),
          datasets: [{
            label: 'Featured Alumni',
            data: items.map(function(i) { return i.count; }),
            borderColor: '#fd7e14',
            backgroundColor: 'rgba(253,126,20,0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: { responsive: true }
      });
    }).catch(function() { showError('featuredTrendChart', 'Failed to load featured trends'); });
  }

  // ─── Overview page quick charts ───

  function renderOverviewJobTitles() {
    apiFetch('/dashboard/proxy/analytics/job-titles', {}).then(function(res) {
      var items = (res.data && res.data.jobTitles) ? res.data.jobTitles.slice(0, 5) : [];
      destroyChart('overviewJobTitles');
      var ctx = document.getElementById('overviewJobTitlesChart');
      if (!ctx) return;
      window.charts.overviewJobTitles = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: items.map(function(j) { return j.title; }),
          datasets: [{
            label: 'Count',
            data: items.map(function(j) { return j.count; }),
            backgroundColor: COLORS.slice(0, items.length)
          }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }).catch(function() {});
  }

  function renderOverviewCompletion() {
    apiFetch('/dashboard/proxy/analytics/profile-completion-rate', {}).then(function(res) {
      var d = res.data || {};
      destroyChart('overviewCompletion');
      var ctx = document.getElementById('overviewCompletionChart');
      if (!ctx) return;
      window.charts.overviewCompletion = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Complete', 'Incomplete'],
          datasets: [{
            data: [d.complete || 0, d.incomplete || 0],
            backgroundColor: ['#198754', '#dc3545']
          }]
        },
        options: { responsive: true }
      });
    }).catch(function() {});
  }

  // ─── Charts page: filter + init ───

  var allChartRenderers = [
    renderCertificationsChart,
    renderCoursesChart,
    renderSectorChart,
    renderCertTrendChart,
    renderEmployersChart,
    renderCompletionChart,
    renderJobTitlesChart,
    renderFeaturedTrendChart
  ];

  function initChartsPage() {
    var form = document.getElementById('filterForm');
    if (!form) return;

    var filters = {};
    allChartRenderers.forEach(function(fn) { fn(filters); });

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      filters = getFilters('filterForm');
      allChartRenderers.forEach(function(fn) { fn(filters); });
    });

    var clearBtn = document.getElementById('clearFilters');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        filters = {};
        setTimeout(function() {
          allChartRenderers.forEach(function(fn) { fn(filters); });
        }, 50);
      });
    }
  }

  // ─── Alumni page ───

  var alumniCurrentPage = 1;
  var alumniFilters = {};

  function loadAlumni(filters, page) {
    var loading = document.getElementById('alumniLoading');
    var errorDiv = document.getElementById('alumniError');
    var tbody = document.getElementById('alumniTableBody');
    if (!tbody) return;

    if (loading) loading.style.display = 'block';
    if (errorDiv) errorDiv.style.display = 'none';

    var params = Object.assign({}, filters, { page: page, limit: 20 });
    apiFetch('/dashboard/proxy/alumni', params).then(function(res) {
      if (loading) loading.style.display = 'none';
      var alumni = (res.data && res.data.alumni) ? res.data.alumni : [];
      var pagination = (res.data && res.data.pagination) ? res.data.pagination : {};

      renderAlumniTable(alumni);
      renderAlumniPagination(pagination);
    }).catch(function(err) {
      if (loading) loading.style.display = 'none';
      if (errorDiv) {
        errorDiv.textContent = 'Failed to load alumni: ' + err.message;
        errorDiv.style.display = 'block';
      }
    });
  }

  function renderAlumniTable(alumni) {
    var tbody = document.getElementById('alumniTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!alumni.length) {
      var row = document.createElement('tr');
      row.innerHTML = '<td colspan="5" class="text-center text-muted py-4">No alumni found</td>';
      tbody.appendChild(row);
      return;
    }

    alumni.forEach(function(profile, idx) {
      var name = (profile.firstName || '') + ' ' + (profile.lastName || '');
      var degree = (profile.Degrees && profile.Degrees.length) ? profile.Degrees[0].name : '—';
      var employer = (profile.Employments && profile.Employments.length)
        ? profile.Employments[profile.Employments.length - 1].company
        : '—';
      var certCount = (profile.Certifications) ? profile.Certifications.length : 0;
      var linkedin = profile.linkedInUrl
        ? '<a href="' + profile.linkedInUrl + '" target="_blank" rel="noopener">View</a>'
        : '—';

      var mainRow = document.createElement('tr');
      mainRow.setAttribute('data-bs-toggle', 'collapse');
      mainRow.setAttribute('data-bs-target', '#detail-' + idx);
      mainRow.setAttribute('role', 'button');
      mainRow.innerHTML =
        '<td>' + escapeHtml(name.trim()) + '</td>' +
        '<td>' + escapeHtml(degree) + '</td>' +
        '<td>' + escapeHtml(employer) + '</td>' +
        '<td>' + certCount + '</td>' +
        '<td>' + linkedin + '</td>';
      tbody.appendChild(mainRow);

      var detailRow = document.createElement('tr');
      detailRow.innerHTML =
        '<td colspan="5" class="p-0">' +
          '<div class="collapse alumni-detail" id="detail-' + idx + '">' +
            buildDetailHtml(profile) +
          '</div>' +
        '</td>';
      tbody.appendChild(detailRow);
    });
  }

  function buildDetailHtml(profile) {
    var html = '';
    if (profile.biography) {
      html += '<h6>Biography</h6><p>' + escapeHtml(profile.biography) + '</p>';
    }

    if (profile.Degrees && profile.Degrees.length) {
      html += '<h6>Degrees</h6><ul>';
      profile.Degrees.forEach(function(d) {
        html += '<li>' + escapeHtml(d.name) + ' — ' + escapeHtml(d.university || '') +
                (d.completionDate ? ' (' + d.completionDate + ')' : '') + '</li>';
      });
      html += '</ul>';
    }

    if (profile.Employments && profile.Employments.length) {
      html += '<h6>Employment History</h6><ul>';
      profile.Employments.forEach(function(e) {
        html += '<li>' + escapeHtml(e.role || '') + ' at ' + escapeHtml(e.company || '') +
                ' (' + (e.startDate || '?') + ' – ' + (e.endDate || 'Present') + ')</li>';
      });
      html += '</ul>';
    }

    if (profile.Certifications && profile.Certifications.length) {
      html += '<h6>Certifications</h6><ul>';
      profile.Certifications.forEach(function(c) {
        html += '<li>' + escapeHtml(c.name) + (c.issuingBody ? ' (' + escapeHtml(c.issuingBody) + ')' : '') + '</li>';
      });
      html += '</ul>';
    }

    if (profile.Licences && profile.Licences.length) {
      html += '<h6>Licences</h6><ul>';
      profile.Licences.forEach(function(l) {
        html += '<li>' + escapeHtml(l.name) + (l.awardingBody ? ' (' + escapeHtml(l.awardingBody) + ')' : '') + '</li>';
      });
      html += '</ul>';
    }

    if (profile.ProfessionalCourses && profile.ProfessionalCourses.length) {
      html += '<h6>Professional Courses</h6><ul>';
      profile.ProfessionalCourses.forEach(function(c) {
        html += '<li>' + escapeHtml(c.name) + (c.provider ? ' (' + escapeHtml(c.provider) + ')' : '') + '</li>';
      });
      html += '</ul>';
    }

    return html || '<p class="text-muted">No additional details available.</p>';
  }

  function renderAlumniPagination(pagination) {
    var nav = document.querySelector('#alumniPagination .pagination');
    if (!nav) return;
    nav.innerHTML = '';

    var totalPages = pagination.totalPages || 1;
    var page = pagination.page || 1;

    var prev = document.createElement('li');
    prev.className = 'page-item' + (page <= 1 ? ' disabled' : '');
    prev.innerHTML = '<a class="page-link" href="#">Previous</a>';
    prev.addEventListener('click', function(e) {
      e.preventDefault();
      if (page > 1) { alumniCurrentPage = page - 1; loadAlumni(alumniFilters, alumniCurrentPage); }
    });
    nav.appendChild(prev);

    var startPage = Math.max(1, page - 2);
    var endPage = Math.min(totalPages, page + 2);

    for (var i = startPage; i <= endPage; i++) {
      (function(pageNum) {
        var li = document.createElement('li');
        li.className = 'page-item' + (pageNum === page ? ' active' : '');
        li.innerHTML = '<a class="page-link" href="#">' + pageNum + '</a>';
        li.addEventListener('click', function(e) {
          e.preventDefault();
          alumniCurrentPage = pageNum;
          loadAlumni(alumniFilters, alumniCurrentPage);
        });
        nav.appendChild(li);
      })(i);
    }

    var next = document.createElement('li');
    next.className = 'page-item' + (page >= totalPages ? ' disabled' : '');
    next.innerHTML = '<a class="page-link" href="#">Next</a>';
    next.addEventListener('click', function(e) {
      e.preventDefault();
      if (page < totalPages) { alumniCurrentPage = page + 1; loadAlumni(alumniFilters, alumniCurrentPage); }
    });
    nav.appendChild(next);
  }

  function initAlumniPage() {
    var form = document.getElementById('alumniFilterForm');
    if (!form) return;

    loadAlumni({}, 1);

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      alumniFilters = getFilters('alumniFilterForm');
      alumniCurrentPage = 1;
      loadAlumni(alumniFilters, 1);
    });

    var clearBtn = document.getElementById('clearAlumniFilters');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        alumniFilters = {};
        alumniCurrentPage = 1;
        setTimeout(function() { loadAlumni({}, 1); }, 50);
      });
    }

    var exportBtn = document.getElementById('exportAlumniCsv');
    if (exportBtn) {
      exportBtn.addEventListener('click', function() {
        var endpoint = withQueryParams('/dashboard/proxy/alumni/export', Object.assign({}, alumniFilters, { format: 'csv' }));
        setExportBtnLoading(exportBtn, true);
        downloadFile(endpoint, 'alumni-export.csv')
          .catch(function(err) {
            alert('Failed to export alumni: ' + err.message);
          })
          .finally(function() {
            setExportBtnLoading(exportBtn, false);
          });
      });
    }
  }

  // ─── Download chart as PNG ───

  function initDownloadButtons() {
    document.querySelectorAll('.download-chart-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var chartId = btn.getAttribute('data-chart');
        if (window.charts[chartId]) {
          var url = window.charts[chartId].toBase64Image();
          var a = document.createElement('a');
          a.href = url;
          a.download = chartId + '.png';
          a.click();
        }
      });
    });
  }

  function setExportBtnLoading(btn, loading) {
    if (loading) {
      btn.dataset.origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.origText || btn.textContent;
    }
  }

  function initExportButtons() {
    document.querySelectorAll('[data-endpoint]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var chartFilters = getFilters('filterForm');
        var endpoint = withQueryParams(btn.dataset.endpoint, chartFilters);
        var filename = btn.dataset.filename || 'export';
        setExportBtnLoading(btn, true);
        downloadFile(endpoint, filename)
          .catch(function(err) {
            alert('Export failed: ' + err.message);
          })
          .finally(function() {
            setExportBtnLoading(btn, false);
          });
      });
    });
  }

  // ─── Utility ───

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── Filter presets (localStorage) ───

  var PRESETS_KEY = 'dashboard_chart_presets';

  function loadPresetsFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function savePresetsToStorage(presets) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }

  function populatePresetSelect() {
    var sel = document.getElementById('presetSelect');
    if (!sel) return;
    var presets = loadPresetsFromStorage();
    sel.innerHTML = '<option value="">Load saved preset…</option>';
    Object.keys(presets).forEach(function(name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  function initPresets() {
    var saveBtn = document.getElementById('savePresetBtn');
    var sel = document.getElementById('presetSelect');
    var delBtn = document.getElementById('deletePresetBtn');
    if (!saveBtn || !sel || !delBtn) return;

    populatePresetSelect();

    saveBtn.addEventListener('click', function() {
      var name = window.prompt('Preset name:');
      if (!name || !name.trim()) return;
      var filters = getFilters('filterForm');
      var presets = loadPresetsFromStorage();
      presets[name.trim()] = filters;
      savePresetsToStorage(presets);
      populatePresetSelect();
      sel.value = name.trim();
    });

    sel.addEventListener('change', function() {
      var name = sel.value;
      if (!name) return;
      var presets = loadPresetsFromStorage();
      var filters = presets[name] || {};
      var form = document.getElementById('filterForm');
      if (!form) return;
      Object.keys(filters).forEach(function(key) {
        var el = form.elements[key];
        if (el) el.value = filters[key] || '';
      });
      allChartRenderers.forEach(function(fn) { fn(filters); });
    });

    delBtn.addEventListener('click', function() {
      var name = sel.value;
      if (!name) return;
      var presets = loadPresetsFromStorage();
      delete presets[name];
      savePresetsToStorage(presets);
      populatePresetSelect();
    });
  }

  // ─── Init on DOM ready ───

  document.addEventListener('DOMContentLoaded', function() {
    // Overview page
    if (document.getElementById('overviewJobTitlesChart')) {
      renderOverviewJobTitles();
    }
    if (document.getElementById('overviewCompletionChart')) {
      renderOverviewCompletion();
    }

    // Charts page
    initChartsPage();
    initPresets();

    // Alumni page
    initAlumniPage();

    // Download buttons
    initDownloadButtons();
    initExportButtons();
  });
})();
