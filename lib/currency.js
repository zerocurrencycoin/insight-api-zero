'use strict';

var request = require('request');

function CurrencyController(options) {
  this.node = options.node;
  var refresh = options.currencyRefresh || CurrencyController.DEFAULT_CURRENCY_DELAY;
  this.currencyDelay = refresh * 60000;
  this.binanceRate = 0; // USD/BTC
  this.cryptopiaRate = 0; // BTC/ZER
  // Initialize the rates we actually serve. Previously self.btc/self.usd were
  // never set in the constructor, so the first index() saw `undefined` and the
  // `self.btc === 0` freshness check never fired on a cold start.
  this.usd = 0;
  this.btc = 0;
  this.timestamp = Date.now();
}

CurrencyController.DEFAULT_CURRENCY_DELAY = 10;

// Crash #4 fix — the outbound price feed failed every ~10 min with
// "certificate has expired". The remote certs are valid; Node 8.17's *bundled*
// CA roots are too stale to validate them, so the TLS handshake is rejected
// locally. Point the request at the OS CA store, which is kept current by the
// distro (ca-certificates), instead of Node's frozen bundle. Falls back to
// Node's default trust if the file is absent.
var fs = require('fs');
var CA_CANDIDATES = [
  '/etc/ssl/certs/ca-certificates.crt',   // Debian/Ubuntu
  '/etc/pki/tls/certs/ca-bundle.crt'      // RHEL/CentOS
];
var SYSTEM_CA = (function() {
  for (var i = 0; i < CA_CANDIDATES.length; i++) {
    try {
      if (fs.existsSync(CA_CANDIDATES[i])) {
        return fs.readFileSync(CA_CANDIDATES[i]);
      }
    } catch (e) { /* fall through to next candidate */ }
  }
  return null;
})();

function requestOpts(url) {
  var opts = { url: url, timeout: 15000, headers: { 'User-Agent': 'ZeroInsight/1.0 (insight-api-zero)' } };
  if (SYSTEM_CA) {
    opts.ca = SYSTEM_CA;
  }
  return opts;
}

CurrencyController.prototype.index = function(req, res) {
  var self = this;
  var currentTime = Date.now();

  // The whole refresh is best-effort: a feed failure must never throw into the
  // request handler. We log at warn (expected, recoverable degraded feed) and
  // serve the last-known rates.
  try {
    if (self.btc === 0 || currentTime >= (self.timestamp + self.currencyDelay)) {
      self.timestamp = currentTime;

      //get USD/ZER
      request(requestOpts('https://api.coingecko.com/api/v3/simple/price?ids=zero&vs_currencies=usd'),
        function(err, response, body) {
          if (err) {
            self.node.log.warn('currency: USD feed fetch failed: ' + (err.message || err));
            return;
          }
          if (response && response.statusCode === 200) {
            try {
              var data = JSON.parse(body);
              self.usd = parseFloat(data.zero.usd);
            } catch (ee) {
              self.node.log.warn('currency: USD feed parse failed: ' + (ee.message || ee));
            }
          } else {
            self.node.log.warn('currency: USD feed bad status: ' +
              (response ? response.statusCode : 'no response'));
          }
      });

      //get BTC/ZER
      request(requestOpts('https://api.coingecko.com/api/v3/simple/price?ids=zero&vs_currencies=btc'),
        function(err, response, body) {
          if (err) {
            self.node.log.warn('currency: BTC feed fetch failed: ' + (err.message || err));
            return;
          }
          if (response && response.statusCode === 200) {
            try {
              var data = JSON.parse(body);
              self.btc = parseFloat(data.zero.btc);
            } catch (ee) {
              self.node.log.warn('currency: BTC feed parse failed: ' + (ee.message || ee));
            }
          } else {
            self.node.log.warn('currency: BTC feed bad status: ' +
              (response ? response.statusCode : 'no response'));
          }
      });
    }
  } catch (e) {
    self.node.log.warn('currency: refresh error: ' + (e.message || e));
  }

  res.jsonp({
    status: 200,
    data: {
      usd: self.usd,
      btc: self.btc,
      binance: self.usd
    }
  });

};

module.exports = CurrencyController;
