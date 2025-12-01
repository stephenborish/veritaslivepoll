(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VeritasPure = factory();
  }
})(this, function () {
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    var text = String(value);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildQueryString(params) {
    if (!params || typeof params !== 'object') return '';
    var pairs = [];
    for (var key in params) {
      if (params.hasOwnProperty(key) && params[key] !== null && params[key] !== undefined) {
        pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
      }
    }
    return pairs.length > 0 ? '?' + pairs.join('&') : '';
  }

  function extractStudentNameParts(fullName) {
    if (!fullName) {
      return { displayName: '', firstName: '', lastName: '', trimmed: '' };
    }
    var trimmed = String(fullName).trim();
    var parts = trimmed.split(/\s+/);

    if (parts.length === 0) {
      return { displayName: '', firstName: '', lastName: '', trimmed: trimmed };
    }

    var firstName = parts[0] || '';
    var lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    var displayName = firstName;
    if (lastName) {
      displayName = firstName + ' ' + lastName.charAt(0) + '.';
    }
    return { displayName: displayName, firstName: firstName, lastName: lastName, trimmed: trimmed };
  }

  function formatStudentName(fullName) {
    return extractStudentNameParts(fullName).displayName;
  }

  function coerceBoolean(value, defaultValue) {
    if (value === null || value === undefined) {
      return Boolean(defaultValue);
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      var lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === 'yes' || lower === '1') return true;
      if (lower === 'false' || lower === 'no' || lower === '0' || lower === '') return false;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(value);
  }

  function normalizeSheetBoolean(value, defaultValue) {
    defaultValue = defaultValue !== undefined ? defaultValue : false;
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      var lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === 'yes' || lower === '1') return true;
      if (lower === 'false' || lower === 'no' || lower === '0') return false;
    }
    return Boolean(value);
  }

  function parseDateInput(value) {
    if (!value) return null;
    try {
      var date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (err) {
      return null;
    }
    var parsed = Date.parse(value);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }
    return null;
  }

  return {
    escapeHtml: escapeHtml,
    buildQueryString: buildQueryString,
    extractStudentNameParts: extractStudentNameParts,
    formatStudentName: formatStudentName,
    coerceBoolean: coerceBoolean,
    normalizeSheetBoolean: normalizeSheetBoolean,
    parseDateInput: parseDateInput
  };
});
