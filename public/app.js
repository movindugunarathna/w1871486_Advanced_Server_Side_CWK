(function () {
  'use strict';

  var content = document.getElementById('content');
  var messageEl = document.getElementById('message');
  var currentUser = null;

  // ─── Helpers ───

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function showMessage(msg, type) {
    if (!msg) {
      messageEl.className = 'alert d-none';
      messageEl.textContent = '';
      return;
    }
    messageEl.className = 'alert alert-' + (type || 'info');
    messageEl.textContent = msg;
    messageEl.classList.remove('d-none');
    window.scrollTo(0, 0);
  }

  function showLinkMessage(msg, type, link, label) {
    if (!link) {
      showMessage(msg, type);
      return;
    }
    messageEl.className = 'alert alert-' + (type || 'info');
    messageEl.innerHTML = escapeHtml(msg) + '<br><a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">' + escapeHtml(label || link) + '</a>';
    messageEl.classList.remove('d-none');
    window.scrollTo(0, 0);
  }

  function api(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.credentials = 'same-origin';
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    return fetch(path, options).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var errMsg = data.message || data.errors && data.errors.map(function(e){ return e.message; }).join(', ') || 'Request failed';
          throw new Error(errMsg);
        }
        return data;
      });
    });
  }

  function updateNav() {
    document.getElementById('nav-guest').classList.toggle('d-none', !!currentUser);
    document.getElementById('nav-user').classList.toggle('d-none', !currentUser);
    document.getElementById('nav-alumnus').classList.toggle('d-none', !currentUser || currentUser.role !== 'alumnus');
    document.getElementById('nav-developer').classList.toggle('d-none', !currentUser || currentUser.role !== 'developer');
    document.getElementById('nav-email').textContent = currentUser ? currentUser.email + ' (' + currentUser.role + ')' : '';
  }

  function restoreSession() {
    return api('/api/auth/me').then(function (data) {
      currentUser = data.data || null;
      updateNav();
      return currentUser;
    }).catch(function () {
      currentUser = null;
      updateNav();
      return null;
    });
  }

  // ─── Auth Pages ───

  function renderLogin() {
    content.innerHTML =
      '<div class="row justify-content-center"><div class="col-md-5">' +
      '<div class="card"><div class="card-body">' +
      '<h3 class="card-title mb-3">Login</h3>' +
      '<form id="form-login">' +
      '<div class="mb-3"><label class="form-label">Email</label>' +
      '<input type="email" class="form-control" name="email" required></div>' +
      '<div class="mb-3"><label class="form-label">Password</label>' +
      '<input type="password" class="form-control" name="password" required></div>' +
      '<button type="submit" class="btn btn-primary w-100">Login</button>' +
      '</form>' +
      '<p class="mt-3 text-center"><a href="#register">Create an account</a> | <a href="#forgot-password">Forgot password?</a></p>' +
      '</div></div></div></div>';

    document.getElementById('form-login').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      api('/api/auth/login', {
        method: 'POST',
        body: { email: form.email.value, password: form.password.value }
      }).then(function (data) {
        currentUser = data.data || data.user;
        updateNav();
        showMessage('Logged in successfully!', 'success');
        location.hash = currentUser.role === 'developer' ? '#api-keys' : '#profile';
      }).catch(function (err) { showMessage(err.message, 'danger'); });
    });
  }

  function renderRegister() {
    content.innerHTML =
      '<div class="row justify-content-center"><div class="col-md-6">' +
      '<div class="card"><div class="card-body">' +
      '<h3 class="card-title mb-3">Register</h3>' +
      '<form id="form-register">' +
      '<div class="mb-3"><label class="form-label">First Name</label>' +
      '<input type="text" class="form-control" name="firstName" required></div>' +
      '<div class="mb-3"><label class="form-label">Last Name</label>' +
      '<input type="text" class="form-control" name="lastName" required></div>' +
      '<div class="mb-3"><label class="form-label">Email</label>' +
      '<input type="email" class="form-control" name="email" required>' +
      '<div class="form-text">Must end with @eastminster.ac.uk</div></div>' +
      '<div class="mb-3"><label class="form-label">Password</label>' +
      '<input type="password" class="form-control" name="password" required>' +
      '<div class="form-text">Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char</div></div>' +
      '<button type="submit" class="btn btn-success w-100">Register</button>' +
      '</form>' +
      '<p class="mt-3 text-center"><a href="#login">Already have an account?</a></p>' +
      '</div></div></div></div>';

    document.getElementById('form-register').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      api('/api/auth/register', {
        method: 'POST',
        body: {
          firstName: form.firstName.value,
          lastName: form.lastName.value,
          email: form.email.value,
          password: form.password.value
        }
      }).then(function (data) {
        showLinkMessage(
          data.message || 'Registration successful! Check your email to verify.',
          'success',
          data.verificationLink || data.emailPreviewUrl,
          data.verificationLink ? 'Verify email now' : 'Open email preview'
        );
        location.hash = '#login';
      }).catch(function (err) { showMessage(err.message, 'danger'); });
    });
  }

  function renderForgotPassword() {
    content.innerHTML =
      '<div class="row justify-content-center"><div class="col-md-5">' +
      '<div class="card"><div class="card-body">' +
      '<h3 class="card-title mb-3">Forgot Password</h3>' +
      '<form id="form-forgot">' +
      '<div class="mb-3"><label class="form-label">Email</label>' +
      '<input type="email" class="form-control" name="email" required></div>' +
      '<button type="submit" class="btn btn-primary w-100">Send Reset Link</button>' +
      '</form>' +
      '<p class="mt-3 text-center"><a href="#login">Back to login</a></p>' +
      '</div></div></div></div>';

    document.getElementById('form-forgot').addEventListener('submit', function (e) {
      e.preventDefault();
      api('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: e.target.email.value }
      }).then(function (data) {
        showLinkMessage(
          data.message || 'If that email exists, a reset link has been sent.',
          'success',
          data.resetLink || data.emailPreviewUrl,
          data.resetLink ? 'Open reset form' : 'Open email preview'
        );
      }).catch(function (err) { showMessage(err.message, 'danger'); });
    });
  }

  function renderResetPassword() {
    var params = new URLSearchParams(location.hash.split('?')[1] || '');
    var token = params.get('token') || '';
    content.innerHTML =
      '<div class="row justify-content-center"><div class="col-md-5">' +
      '<div class="card"><div class="card-body">' +
      '<h3 class="card-title mb-3">Reset Password</h3>' +
      '<form id="form-reset">' +
      '<div class="mb-3"><label class="form-label">Token</label>' +
      '<input type="text" class="form-control" name="token" value="' + escapeHtml(token) + '" required readonly></div>' +
      '<div class="mb-3"><label class="form-label">New Password</label>' +
      '<input type="password" class="form-control" name="newPassword" required></div>' +
      '<button type="submit" class="btn btn-primary w-100">Reset Password</button>' +
      '</form></div></div></div></div>';

    document.getElementById('form-reset').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      api('/api/auth/reset-password?token=' + encodeURIComponent(form.token.value), {
        method: 'POST',
        body: { newPassword: form.newPassword.value }
      }).then(function (data) {
        showMessage(data.message || 'Password reset successful!', 'success');
        location.hash = '#login';
      }).catch(function (err) { showMessage(err.message, 'danger'); });
    });
  }

  // ─── Profile Pages ───

  function renderProfile() {
    content.innerHTML = '<h2>My Profile</h2><p>Loading...</p>';
    api('/api/profile').then(function (data) {
      var p = data.data || data.profile || data;
      var html = '<div class="d-flex justify-content-between align-items-start mb-3">' +
        '<h2>My Profile</h2>' +
        '<a href="#profile/edit" class="btn btn-outline-primary btn-sm">Edit Profile</a></div>';

      // Profile image
      if (p.profileImagePath) {
        html += '<img src="/' + escapeHtml(p.profileImagePath) + '" class="rounded-circle mb-3" width="100" height="100">';
      }

      // Personal info
      html += '<div class="card mb-3"><div class="card-body">' +
        '<h5 class="card-title">Personal Info</h5>' +
        '<p><strong>Name:</strong> ' + escapeHtml((p.firstName || '') + ' ' + (p.lastName || '')) + '</p>' +
        '<p><strong>Biography:</strong> ' + escapeHtml(p.biography || 'Not set') + '</p>' +
        '<p><strong>LinkedIn:</strong> ' + (p.linkedInUrl ? '<a href="' + escapeHtml(p.linkedInUrl) + '" target="_blank">' + escapeHtml(p.linkedInUrl) + '</a>' : 'Not set') + '</p>' +
        '<p><strong>Profile Complete:</strong> ' + (p.profileComplete ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-warning">No</span>') + '</p>' +
        '</div></div>';

      // Sub-resource sections
      var sections = [
        { key: 'Degrees', items: p.Degrees, hash: 'degrees', fields: ['name', 'university', 'officialUrl', 'completionDate'] },
        { key: 'Certifications', items: p.Certifications, hash: 'certifications', fields: ['name', 'issuingBody', 'courseUrl', 'completionDate'] },
        { key: 'Licences', items: p.Licences, hash: 'licences', fields: ['name', 'awardingBody', 'licenceUrl', 'completionDate'] },
        { key: 'ProfessionalCourses', items: p.ProfessionalCourses, hash: 'courses', fields: ['name', 'provider', 'courseUrl', 'completionDate'] },
        { key: 'Employments', items: p.Employments, hash: 'employment', fields: ['company', 'role', 'startDate', 'endDate'] }
      ];

      sections.forEach(function (sec) {
        html += '<div class="card mb-3"><div class="card-body">' +
          '<div class="d-flex justify-content-between">' +
          '<h5 class="card-title">' + sec.key + '</h5>' +
          '<a href="#profile/' + sec.hash + '/new" class="btn btn-outline-success btn-sm">+ Add</a></div>';
        var items = sec.items || [];
        if (items.length === 0) {
          html += '<p class="text-muted">None added yet.</p>';
        } else {
          html += '<table class="table table-sm mt-2"><thead><tr>';
          sec.fields.forEach(function (f) { html += '<th>' + escapeHtml(f) + '</th>'; });
          html += '<th>Actions</th></tr></thead><tbody>';
          items.forEach(function (item) {
            html += '<tr>';
            sec.fields.forEach(function (f) { html += '<td>' + escapeHtml(item[f] || '-') + '</td>'; });
            html += '<td>' +
              '<a href="#profile/' + sec.hash + '/' + item.id + '/edit" class="btn btn-outline-primary btn-sm me-1">Edit</a>' +
              '<button class="btn btn-outline-danger btn-sm btn-delete" data-section="' + sec.hash + '" data-id="' + item.id + '">Delete</button>' +
              '</td></tr>';
          });
          html += '</tbody></table>';
        }
        html += '</div></div>';
      });

      // Image upload
      html += '<div class="card mb-3"><div class="card-body">' +
        '<h5 class="card-title">Profile Image</h5>' +
        '<form id="form-image" enctype="multipart/form-data">' +
        '<div class="input-group">' +
        '<input type="file" class="form-control" name="image" accept="image/jpeg,image/png">' +
        '<button type="submit" class="btn btn-primary">Upload</button>' +
        '</div><div class="form-text">JPEG or PNG, max 5MB</div>' +
        '</form></div></div>';

      // Profile completion
      html += '<div class="card mb-3"><div class="card-body">' +
        '<h5 class="card-title">Completion Status</h5>' +
        '<div id="completion-status">Loading...</div>' +
        '</div></div>';

      content.innerHTML = html;

      // Load completion status
      api('/api/profile/completion').then(function (comp) {
        var c = comp.data || comp;
        var statusEl = document.getElementById('completion-status');
        if (statusEl) {
          var fields = ['firstName', 'lastName', 'biography', 'linkedInUrl', 'profileImage', 'hasDegree', 'hasEmployment'];
          statusEl.innerHTML = fields.map(function (f) {
            return '<span class="badge ' + (c[f] ? 'bg-success' : 'bg-secondary') + ' me-1">' + f + '</span>';
          }).join('') + '<br><br><strong>Complete:</strong> ' + (c.isComplete ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-warning">No</span>');
        }
      }).catch(function () {});

      // Image upload handler
      var imgForm = document.getElementById('form-image');
      if (imgForm) {
        imgForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var formData = new FormData(e.target);
          api('/api/profile/image', { method: 'POST', body: formData }).then(function () {
            showMessage('Image uploaded!', 'success');
            renderProfile();
          }).catch(function (err) { showMessage(err.message, 'danger'); });
        });
      }

      // Delete handlers
      content.querySelectorAll('.btn-delete').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var section = this.getAttribute('data-section');
          var id = this.getAttribute('data-id');
          if (!confirm('Delete this ' + section.slice(0, -1) + '?')) return;
          api('/api/profile/' + section + '/' + id, { method: 'DELETE' }).then(function () {
            showMessage('Deleted successfully!', 'success');
            renderProfile();
          }).catch(function (err) { showMessage(err.message, 'danger'); });
        });
      });

    }).catch(function (err) {
      content.innerHTML = '<div class="alert alert-danger">' + escapeHtml(err.message) + '</div>';
    });
  }

  function renderProfileEdit() {
    content.innerHTML = '<h3>Edit Profile</h3><p>Loading...</p>';
    api('/api/profile').then(function (data) {
      var p = data.data || data.profile || data;
      content.innerHTML =
        '<div class="row justify-content-center"><div class="col-md-7">' +
        '<h3>Edit Profile</h3>' +
        '<form id="form-profile-edit">' +
        '<div class="mb-3"><label class="form-label">First Name</label>' +
        '<input type="text" class="form-control" name="firstName" value="' + escapeHtml(p.firstName || '') + '"></div>' +
        '<div class="mb-3"><label class="form-label">Last Name</label>' +
        '<input type="text" class="form-control" name="lastName" value="' + escapeHtml(p.lastName || '') + '"></div>' +
        '<div class="mb-3"><label class="form-label">Biography</label>' +
        '<textarea class="form-control" name="biography" rows="3">' + escapeHtml(p.biography || '') + '</textarea></div>' +
        '<div class="mb-3"><label class="form-label">LinkedIn URL</label>' +
        '<input type="url" class="form-control" name="linkedInUrl" value="' + escapeHtml(p.linkedInUrl || '') + '"></div>' +
        '<button type="submit" class="btn btn-primary">Save</button> ' +
        '<a href="#profile" class="btn btn-secondary">Cancel</a>' +
        '</form></div></div>';

      document.getElementById('form-profile-edit').addEventListener('submit', function (e) {
        e.preventDefault();
        var form = e.target;
        api('/api/profile', {
          method: 'PUT',
          body: {
            firstName: form.firstName.value,
            lastName: form.lastName.value,
            biography: form.biography.value,
            linkedInUrl: form.linkedInUrl.value
          }
        }).then(function () {
          showMessage('Profile updated!', 'success');
          location.hash = '#profile';
        }).catch(function (err) { showMessage(err.message, 'danger'); });
      });
    }).catch(function (err) { showMessage(err.message, 'danger'); });
  }

  // Generic sub-resource add/edit forms
  var subResourceConfig = {
    degrees: {
      label: 'Degree',
      fields: [
        { name: 'name', label: 'Degree Name', type: 'text', required: true },
        { name: 'university', label: 'University', type: 'text' },
        { name: 'officialUrl', label: 'Official URL', type: 'url' },
        { name: 'completionDate', label: 'Completion Date', type: 'date' }
      ]
    },
    certifications: {
      label: 'Certification',
      fields: [
        { name: 'name', label: 'Certification Name', type: 'text', required: true },
        { name: 'issuingBody', label: 'Issuing Body', type: 'text' },
        { name: 'courseUrl', label: 'Course URL', type: 'url' },
        { name: 'completionDate', label: 'Completion Date', type: 'date' }
      ]
    },
    licences: {
      label: 'Licence',
      fields: [
        { name: 'name', label: 'Licence Name', type: 'text', required: true },
        { name: 'awardingBody', label: 'Awarding Body', type: 'text' },
        { name: 'licenceUrl', label: 'Licence URL', type: 'url' },
        { name: 'completionDate', label: 'Completion Date', type: 'date' }
      ]
    },
    courses: {
      label: 'Professional Course',
      fields: [
        { name: 'name', label: 'Course Name', type: 'text', required: true },
        { name: 'provider', label: 'Provider', type: 'text' },
        { name: 'courseUrl', label: 'Course URL', type: 'url' },
        { name: 'completionDate', label: 'Completion Date', type: 'date' }
      ]
    },
    employment: {
      label: 'Employment',
      fields: [
        { name: 'company', label: 'Company', type: 'text' },
        { name: 'role', label: 'Role', type: 'text' },
        { name: 'startDate', label: 'Start Date', type: 'date' },
        { name: 'endDate', label: 'End Date (leave empty if current)', type: 'date' }
      ]
    }
  };

  function renderSubResourceForm(section, id) {
    var config = subResourceConfig[section];
    if (!config) { content.innerHTML = '<p>Unknown section.</p>'; return; }
    var isEdit = !!id;
    var title = (isEdit ? 'Edit ' : 'Add ') + config.label;

    function buildForm(values) {
      var html = '<div class="row justify-content-center"><div class="col-md-7">' +
        '<h3>' + title + '</h3>' +
        '<form id="form-subresource">';
      config.fields.forEach(function (f) {
        html += '<div class="mb-3"><label class="form-label">' + f.label + '</label>' +
          '<input type="' + f.type + '" class="form-control" name="' + f.name + '"' +
          (f.required ? ' required' : '') +
          ' value="' + escapeHtml(values[f.name] || '') + '"></div>';
      });
      html += '<button type="submit" class="btn btn-primary">' + (isEdit ? 'Update' : 'Create') + '</button> ' +
        '<a href="#profile" class="btn btn-secondary">Cancel</a>' +
        '</form></div></div>';
      content.innerHTML = html;

      document.getElementById('form-subresource').addEventListener('submit', function (e) {
        e.preventDefault();
        var form = e.target;
        var body = {};
        config.fields.forEach(function (f) { body[f.name] = form[f.name].value || null; });
        var url = '/api/profile/' + section + (isEdit ? '/' + id : '');
        var method = isEdit ? 'PUT' : 'POST';
        api(url, { method: method, body: body }).then(function () {
          showMessage(config.label + (isEdit ? ' updated!' : ' added!'), 'success');
          location.hash = '#profile';
        }).catch(function (err) { showMessage(err.message, 'danger'); });
      });
    }

    if (isEdit) {
      api('/api/profile/' + section).then(function (data) {
        var items = data.data || data;
        if (Array.isArray(items)) {
          var item = items.find(function (i) { return String(i.id) === String(id); });
          buildForm(item || {});
        } else {
          buildForm({});
        }
      }).catch(function (err) { showMessage(err.message, 'danger'); });
    } else {
      buildForm({});
    }
  }

  // ─── Bidding Pages ───

  function renderBidding() {
    content.innerHTML = '<h2>Bidding Dashboard</h2><p>Loading...</p>';

    Promise.all([
      api('/api/bidding/slot').catch(function () { return null; }),
      api('/api/bidding/monthly-status').catch(function () { return null; }),
      api('/api/bidding/history?page=1&limit=10').catch(function () { return null; })
    ]).then(function (results) {
      var slot = results[0];
      var monthly = results[1];
      var history = results[2];
      var currentBid = slot && slot.data ? slot.data.currentUserBid : null;

      var html = '<h2>Bidding Dashboard</h2>';

      // Slot info
      html += '<div class="card mb-3"><div class="card-body">';
      if (slot && slot.data) {
        var s = slot.data;
        html += '<h5>Tomorrow\'s Slot — ' + escapeHtml(s.date) + '</h5>' +
          '<p>Bidding: ' + (s.biddingOpen ? '<span class="badge bg-success">Open</span>' : '<span class="badge bg-danger">Closed</span>') + '</p>' +
          '<p>Total bids: ' + (s.totalBids || 0) + '</p>';
        if (s.currentUserBid) {
          html += '<p>Your bid status: <span class="badge bg-info">' + s.currentUserBid.status + '</span></p>';
        }
      } else {
        html += '<p class="text-muted">Could not load slot info.</p>';
      }
      html += '</div></div>';

      // Place bid form
      html += '<div class="card mb-3"><div class="card-body">' +
        '<h5>Place / Update Bid</h5>' +
        '<form id="form-bid" class="row g-2 align-items-end">' +
        '<div class="col-auto"><label class="form-label">Amount</label>' +
        '<input type="number" class="form-control" name="amount" step="0.01" min="0.01" required></div>' +
        '<div class="col-auto"><button type="submit" class="btn btn-primary">Place Bid</button></div>' +
        '</form></div></div>';

      // Monthly status
      html += '<div class="card mb-3"><div class="card-body">';
      if (monthly && monthly.data) {
        var m = monthly.data;
        html += '<h5>Monthly Status — ' + escapeHtml(m.month) + '</h5>' +
          '<p>Wins this month: ' + m.winsThisMonth + ' / ' + m.maxAllowed + '</p>' +
          '<p>Attended event: ' + (m.attendedEvent ? 'Yes' : 'No') + '</p>' +
          '<p>Remaining slots: ' + m.remainingSlots + '</p>';
      } else {
        html += '<p class="text-muted">Could not load monthly status.</p>';
      }
      html += '</div></div>';

      // Bid history
      html += '<div class="card mb-3"><div class="card-body">' +
        '<h5>Bid History</h5>';
      if (history && history.data && history.data.length > 0) {
        html += '<table class="table table-sm"><thead><tr>' +
          '<th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
        history.data.forEach(function (bid) {
          html += '<tr><td>' + escapeHtml(bid.bidDate) + '</td>' +
            '<td><span class="badge bg-' + bidStatusColor(bid.status) + '">' + bid.status + '</span></td>' +
            '<td>';
          if (bid.status === 'active') {
            html += '<button class="btn btn-outline-info btn-sm btn-bid-status me-1" data-id="' + bid.id + '">Status</button>' +
              '<button class="btn btn-outline-danger btn-sm btn-bid-cancel" data-id="' + bid.id + '">Cancel</button>';
          }
          html += '</td></tr>';
        });
        html += '</tbody></table>';
      } else {
        html += '<p class="text-muted">No bids yet.</p>';
      }
      html += '</div></div>';

      content.innerHTML = html;

      // Place bid handler
      document.getElementById('form-bid').addEventListener('submit', function (e) {
        e.preventDefault();
        var bidAmount = parseFloat(e.target.amount.value);
        var bidPromise = null;
        // Increase-only update: if we already have an active bid, use PUT.
        if (currentBid && currentBid.status === 'active' && currentBid.bidId) {
          bidPromise = api('/api/bidding/bid/' + currentBid.bidId, {
            method: 'PUT',
            body: { amount: bidAmount }
          });
        } else {
          bidPromise = api('/api/bidding/bid', {
            method: 'POST',
            body: { amount: bidAmount }
          });
        }
        bidPromise.then(function (data) {
          showMessage(data.message || 'Bid placed!', 'success');
          renderBidding();
        }).catch(function (err) { showMessage(err.message, 'danger'); });
      });

      // Bid status handlers
      content.querySelectorAll('.btn-bid-status').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var bidId = this.getAttribute('data-id');
          api('/api/bidding/bid/' + bidId + '/status').then(function (data) {
            var d = data.data || data;
            showMessage('Bid ' + bidId + ': ' + d.position, 'info');
          }).catch(function (err) { showMessage(err.message, 'danger'); });
        });
      });

      // Cancel bid handlers
      content.querySelectorAll('.btn-bid-cancel').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var bidId = this.getAttribute('data-id');
          if (!confirm('Cancel this bid?')) return;
          api('/api/bidding/bid/' + bidId, { method: 'DELETE' }).then(function () {
            showMessage('Bid cancelled.', 'success');
            renderBidding();
          }).catch(function (err) { showMessage(err.message, 'danger'); });
        });
      });

    });
  }

  function bidStatusColor(status) {
    switch (status) {
      case 'active': return 'primary';
      case 'won': return 'success';
      case 'lost': return 'danger';
      case 'cancelled': return 'secondary';
      default: return 'info';
    }
  }

  // ─── Developer Pages ───

  function renderApiKeys() {
    content.innerHTML = '<h2>API Keys</h2><p>Loading...</p>';

    api('/api/developer/api-keys').then(function (data) {
      var keys = data.data || data.keys || [];
      var html = '<div class="d-flex justify-content-between align-items-center mb-3">' +
        '<h2>API Keys</h2></div>';

      // Create key form
      html += '<div class="card mb-3"><div class="card-body">' +
        '<h5>Generate New Key</h5>' +
        '<form id="form-new-key" class="row g-2 align-items-end">' +
        '<div class="col-auto"><label class="form-label">Key Label</label>' +
        '<input type="text" class="form-control" name="name" placeholder="e.g. My AR App" required></div>' +
        '<div class="col-auto"><button type="submit" class="btn btn-success">Generate</button></div>' +
        '</form>' +
        '<div id="new-key-result" class="mt-2"></div>' +
        '</div></div>';

      // Key list
      html += '<div class="card mb-3"><div class="card-body">' +
        '<h5>Your Keys</h5>';
      if (keys.length === 0) {
        html += '<p class="text-muted">No API keys yet.</p>';
      } else {
        html += '<table class="table table-sm"><thead><tr>' +
          '<th>Name</th><th>Key Prefix</th><th>Status</th><th>Created</th><th>Actions</th>' +
          '</tr></thead><tbody>';
        keys.forEach(function (k) {
          html += '<tr><td>' + escapeHtml(k.name) + '</td>' +
            '<td><code>' + escapeHtml(k.keyPrefix || (k.key ? k.key.substring(0, 8) + '...' : '???')) + '</code></td>' +
            '<td>' + (k.isRevoked ? '<span class="badge bg-danger">Revoked</span>' : '<span class="badge bg-success">Active</span>') + '</td>' +
            '<td>' + escapeHtml(k.createdAt || '') + '</td>' +
            '<td>';
          if (!k.isRevoked) {
            html += '<button class="btn btn-outline-danger btn-sm btn-revoke me-1" data-id="' + k.id + '">Revoke</button>';
          }
          html += '<button class="btn btn-outline-info btn-sm btn-stats" data-id="' + k.id + '">Stats</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
      }
      html += '</div></div>';

      // Stats area
      html += '<div id="stats-area"></div>';

      content.innerHTML = html;

      // Generate key handler
      document.getElementById('form-new-key').addEventListener('submit', function (e) {
        e.preventDefault();
        api('/api/developer/api-keys', {
          method: 'POST',
          body: { name: e.target.name.value }
        }).then(function (data) {
          var key = data.data ? data.data.key : data.key;
          document.getElementById('new-key-result').innerHTML =
            '<div class="alert alert-warning"><strong>Save this key now — it won\'t be shown again!</strong><br>' +
            '<code class="user-select-all">' + escapeHtml(key) + '</code></div>';
          showMessage('API key generated!', 'success');
        }).catch(function (err) { showMessage(err.message, 'danger'); });
      });

      // Revoke handlers
      content.querySelectorAll('.btn-revoke').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-id');
          if (!confirm('Revoke this API key?')) return;
          api('/api/developer/api-keys/' + id, { method: 'DELETE' }).then(function () {
            showMessage('Key revoked.', 'success');
            renderApiKeys();
          }).catch(function (err) { showMessage(err.message, 'danger'); });
        });
      });

      // Stats handlers
      content.querySelectorAll('.btn-stats').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-id');
          api('/api/developer/api-keys/' + id + '/stats').then(function (data) {
            var s = data.data || data;
            var area = document.getElementById('stats-area');
            area.innerHTML = '<div class="card"><div class="card-body">' +
              '<h5>Stats for: ' + escapeHtml(s.keyName || 'Key ' + id) + '</h5>' +
              '<p>Total requests: ' + (s.totalRequests || 0) + '</p>' +
              '<p>Last 7 days: ' + (s.last7Days || 0) + '</p>' +
              '<h6>Endpoint Breakdown</h6>' +
              '<pre>' + escapeHtml(JSON.stringify(s.endpointBreakdown || {}, null, 2)) + '</pre>' +
              '<h6>Recent Requests</h6>' +
              '<pre>' + escapeHtml(JSON.stringify(s.recentRequests || [], null, 2)) + '</pre>' +
              '</div></div>';
          }).catch(function (err) { showMessage(err.message, 'danger'); });
        });
      });

    }).catch(function (err) {
      content.innerHTML = '<div class="alert alert-danger">' + escapeHtml(err.message) + '</div>';
    });
  }

  // ─── Public API Test ───

  function renderTestPublicApi() {
    content.innerHTML =
      '<h2>Test Public API</h2>' +
      '<div class="card mb-3"><div class="card-body">' +
      '<h5>GET /api/alumni-of-the-day</h5>' +
      '<p>Enter an API key to test the public endpoint.</p>' +
      '<form id="form-test-api" class="row g-2 align-items-end">' +
      '<div class="col-md-8"><label class="form-label">API Key</label>' +
      '<input type="text" class="form-control" name="apiKey" placeholder="Paste your API key here" required></div>' +
      '<div class="col-auto"><button type="submit" class="btn btn-primary">Fetch</button></div>' +
      '</form>' +
      '</div></div>' +
      '<div id="api-result"></div>';

    document.getElementById('form-test-api').addEventListener('submit', function (e) {
      e.preventDefault();
      var apiKey = e.target.apiKey.value;
      fetch('/api/alumni-of-the-day', {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      }).then(function (res) {
        return res.json().then(function (data) {
          document.getElementById('api-result').innerHTML =
            '<div class="card"><div class="card-body">' +
            '<h5>Response <span class="badge bg-' + (res.ok ? 'success' : 'danger') + '">' + res.status + '</span></h5>' +
            '<pre class="bg-light p-3 rounded">' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>' +
            '</div></div>';
        });
      }).catch(function (err) {
        document.getElementById('api-result').innerHTML =
          '<div class="alert alert-danger">' + escapeHtml(err.message) + '</div>';
      });
    });
  }

  // ─── Home Page ───

  function renderHome() {
    content.innerHTML =
      '<div class="text-center py-5">' +
      '<h1>Alumni Influencers Platform</h1>' +
      '<p class="lead">Bid for the "Alumni of the Day" featured spot.</p>' +
      '<hr>' +
      '<div class="row mt-4">' +
      '<div class="col-md-4"><div class="card"><div class="card-body">' +
      '<h5>Alumni</h5><p>Register, build your profile, and bid for the featured spot.</p>' +
      '<a href="#register" class="btn btn-outline-primary">Get Started</a>' +
      '</div></div></div>' +
      '<div class="col-md-4"><div class="card"><div class="card-body">' +
      '<h5>Developers</h5><p>Generate API keys and integrate Alumni of the Day into your apps.</p>' +
      '<a href="#login" class="btn btn-outline-success">Login</a>' +
      '</div></div></div>' +
      '<div class="col-md-4"><div class="card"><div class="card-body">' +
      '<h5>API Docs</h5><p>Explore the full interactive API documentation.</p>' +
      '<a href="/api-docs" target="_blank" class="btn btn-outline-info">Swagger UI</a>' +
      '</div></div></div>' +
      '</div></div>';
  }

  // ─── Router ───

  function route() {
    var hash = (location.hash || '#home').slice(1);
    // Ignore query-string part in hash (e.g. "#reset-password?token=...")
    // so that routing matches "reset-password" exactly.
    var pathPart = hash.split('?')[0];
    var parts = pathPart.split('/');
    var base = parts[0];
    showMessage('');

    // If already logged in, don't show auth pages that would confuse the user.
    if (currentUser && (base === 'login' || base === 'register')) {
      location.hash = '#profile';
      return;
    }

    switch (base) {
      case 'home':
      case '':
        renderHome();
        break;
      case 'login':
        renderLogin();
        break;
      case 'register':
        renderRegister();
        break;
      case 'forgot-password':
        renderForgotPassword();
        break;
      case 'reset-password':
        renderResetPassword();
        break;
      case 'profile':
        if (parts[1] === 'edit') {
          renderProfileEdit();
        } else if (parts[1] && parts[2] === 'new') {
          renderSubResourceForm(parts[1]);
        } else if (parts[1] && parts[2] && parts[3] === 'edit') {
          renderSubResourceForm(parts[1], parts[2]);
        } else {
          renderProfile();
        }
        break;
      case 'bidding':
        renderBidding();
        break;
      case 'api-keys':
        renderApiKeys();
        break;
      case 'test-public-api':
        renderTestPublicApi();
        break;
      default:
        renderHome();
    }
  }

  // ─── Logout ───

  document.getElementById('btn-logout').addEventListener('click', function (e) {
    e.preventDefault();
    api('/api/auth/logout', { method: 'POST' }).then(function () {
      currentUser = null;
      updateNav();
      showMessage('Logged out.', 'info');
      location.hash = '#login';
    }).catch(function (err) { showMessage(err.message, 'danger'); });
  });

  // ─── Init ───

  window.addEventListener('hashchange', route);
  restoreSession().then(function () {
    route();
  });
})();
