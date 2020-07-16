'use strict';

var request = require('request');

function CurrencyController(options) {
  this.node = options.node;
  var refresh = options.currencyRefresh || CurrencyController.DEFAULT_CURRENCY_DELAY;
  this.currencyDelay = refresh * 60000;
  this.binanceRate = 0; // USD/BTC
  this.cryptopiaRate = 0; // BTC/ZER
  this.timestamp = Date.now();
}

CurrencyController.DEFAULT_CURRENCY_DELAY = 10;

CurrencyController.prototype.index = function(req, res) {
  var self = this;
  var currentTime = Date.now();

  if (self.btc === 0 || currentTime >= (self.timestamp + self.currencyDelay)) {
    self.timestamp = currentTime;

    //get USD/ZER
    request('https://api.coingecko.com/api/v3/simple/price?ids=zero&vs_currencies=usd', function(err, response, body) {
        if (err) {
            self.node.log.error(err);
        }
        if (!err && response.statusCode === 200) {
            try {
                var data = JSON.parse(body);
                self.usd = parseFloat(data.zero.usd);
            } catch(ee) {
                console.log(ee);
            }
        }
    });

    //get BTC/ZER
    request('https://api.coingecko.com/api/v3/simple/price?ids=zero&vs_currencies=btc', function(err, response, body) {
        if (err) {
            self.node.log.error(err);
        }
        if (!err && response.statusCode === 200) {
            try {
                var data = JSON.parse(body);
                self.btc = parseFloat(data.zero.btc);
            } catch(ee) {
                console.log(ee);
            }
        }
    });
  }

  res.jsonp({
    status: 200,
    data: {
      usd: self.usd,
      btc: self.btc
    }
  });

};

module.exports = CurrencyController;
