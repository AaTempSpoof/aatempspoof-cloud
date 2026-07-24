(function (global) {
  'use strict';

  var RAW_CONFIG_URL = 'https://raw.githubusercontent.com/AaTempSpoof/aatempspoof-cloud/main/cloud.txt';
  var STORAGE_KEY = 'aats.cloud.endpoint.v2';
  var memoryBase = '';
  var memoryExpires = 0;
  var resolving = null;

  function now() {
    return Date.now();
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function normalizeBase(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function validBase(value) {
    return /^https:\/\/[-A-Za-z0-9.]+\.trycloudflare\.com$/i.test(normalizeBase(value));
  }

  function readStored() {
    try {
      var value = JSON.parse(global.sessionStorage.getItem(STORAGE_KEY) || '{}');
      if (validBase(value.base) && Number(value.expires || 0) > now()) return value;
    } catch (_) {}
    return null;
  }

  function saveBase(base, expires) {
    memoryBase = normalizeBase(base);
    memoryExpires = Number(expires || 0);
    try {
      global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ base: memoryBase, expires: memoryExpires }));
    } catch (_) {}
    return memoryBase;
  }

  function clearBase() {
    memoryBase = '';
    memoryExpires = 0;
    try { global.sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var requestOptions = options || {};
    if (typeof global.AbortController === 'function') {
      var controller = new global.AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      requestOptions = Object.assign({}, requestOptions, { signal: controller.signal });
      return global.fetch(url, requestOptions).then(function (response) {
        clearTimeout(timer);
        return response;
      }, function (error) {
        clearTimeout(timer);
        throw error;
      });
    }
    return Promise.race([
      global.fetch(url, requestOptions),
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('云端连接超时')); }, timeoutMs);
      })
    ]);
  }

  function makeRetryable(message) {
    var error = new Error(message || '云端入口暂时不可用');
    error.retryable = true;
    return error;
  }

  function parseConfig(text) {
    var api = String(text || '').match(/^api=(https:\/\/[-A-Za-z0-9.]+\.trycloudflare\.com)\s*$/mi);
    var expires = String(text || '').match(/^expires=([0-9]+)\s*$/mi);
    if (!api || !expires || !validBase(api[1])) throw makeRetryable('云端入口配置无效');
    var expiresMs = Number(expires[1]) * 1000;
    if (!isFinite(expiresMs) || expiresMs <= now() + 5000) {
      throw makeRetryable('云端入口配置已过期');
    }
    return { base: normalizeBase(api[1]), expires: expiresMs };
  }

  function probe(base) {
    base = normalizeBase(base);
    if (!validBase(base)) return Promise.reject(makeRetryable('云端入口地址无效'));
    return fetchWithTimeout(base + '/health', { cache: 'no-store', referrerPolicy: 'no-referrer' }, 6500)
      .then(function (response) {
        if (!response.ok) throw makeRetryable('云端入口不可用: HTTP ' + response.status);
        return response.text();
      })
      .then(function (text) {
        if (text.indexOf('"service":"AaTempSpoof local cloud"') < 0) {
          throw makeRetryable('云端健康检查未通过');
        }
        return base;
      });
  }

  function configCandidate(url) {
    var cacheBuster = (url.indexOf('?') >= 0 ? '&' : '?') + '_aats=' + now();
    return fetchWithTimeout(url + cacheBuster, { cache: 'no-store', referrerPolicy: 'no-referrer' }, 6500)
      .then(function (response) {
        if (!response.ok) throw makeRetryable('云端入口读取失败: HTTP ' + response.status);
        return response.text();
      })
      .then(function (text) {
        var entry = parseConfig(text);
        return probe(entry.base).then(function (base) { return { base: base, expires: entry.expires }; });
      });
  }

  function firstSuccess(tasks) {
    return new Promise(function (resolve, reject) {
      var pending = tasks.length;
      var lastError = makeRetryable('云端入口暂时不可用');
      var settled = false;
      if (!pending) {
        reject(lastError);
        return;
      }
      tasks.forEach(function (task) {
        task().then(function (value) {
          if (settled) return;
          settled = true;
          resolve(value);
        }, function (error) {
          lastError = error || lastError;
          pending -= 1;
          if (!settled && pending === 0) reject(lastError);
        });
      });
    });
  }

  function pageConfigUrl() {
    try { return new global.URL('cloud.txt', global.location.href).toString(); } catch (_) {}
    return global.location.protocol + '//' + global.location.host + '/cloud.txt';
  }

  function resolveBase(forceReload) {
    if (!forceReload && memoryBase && memoryExpires > now()) return Promise.resolve(memoryBase);
    if (resolving) return resolving;
    var tasks = [];
    var stored = readStored();
    if (!forceReload && stored) {
      tasks.push(function () {
        return probe(stored.base).then(function (base) { return { base: base, expires: stored.expires }; });
      });
    }
    if (/\.trycloudflare\.com$/i.test(global.location.hostname || '')) {
      tasks.push(function () {
        return probe(global.location.origin).then(function (base) {
          return { base: base, expires: now() + 5 * 60 * 1000 };
        });
      });
    }
    // Raw 提交可见后立即使用；Pages 仅作静态网页和配置备用。
    tasks.push(function () { return configCandidate(RAW_CONFIG_URL); });
    tasks.push(function () { return configCandidate(pageConfigUrl()); });
    resolving = firstSuccess(tasks).then(function (entry) {
      resolving = null;
      return saveBase(entry.base, entry.expires);
    }, function (error) {
      resolving = null;
      clearBase();
      throw error;
    });
    return resolving;
  }

  function request(path, options, maxAttempts) {
    var attempts = Math.max(1, Math.min(3, Number(maxAttempts || 2) || 2));
    var requestOptions = Object.assign({ cache: 'no-store', referrerPolicy: 'no-referrer' }, options || {});
    var tryRequest = function (attempt) {
      return resolveBase(attempt > 0).then(function (base) {
        return fetchWithTimeout(base + path, requestOptions, 12000).then(function (response) {
          if ([502, 503, 504, 530].indexOf(response.status) >= 0) {
            throw makeRetryable('云端入口不可用: HTTP ' + response.status);
          }
          return response;
        });
      }).catch(function (error) {
        clearBase();
        if (attempt + 1 >= attempts) throw error;
        return wait([700, 1600][attempt] || 2500).then(function () { return tryRequest(attempt + 1); });
      });
    };
    return tryRequest(0);
  }

  global.AaTempCloud = {
    resolve: resolveBase,
    request: request,
    isRetryable: function (error) {
      if (error && error.retryable) return true;
      return /云端入口|failed to fetch|networkerror|load failed|abort|timeout|timed out/i
        .test(String((error && error.message) || error || ''));
    }
  };
}(window));
