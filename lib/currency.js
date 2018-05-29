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
  if (self.binanceRate === 0 || currentTime >= (self.timestamp + self.currencyDelay)) {
    self.timestamp = currentTime;
    request('https://api.binance.com/api/v1/ticker/price?symbol=BTCUSDT', function(err, response, body) {
      if (err) {
        self.node.log.error(err);
      }
      if (!err && response.statusCode === 200) {
        self.binanceRate = parseFloat(JSON.parse(body).price);
      }
      request('https://www.cryptopia.co.nz/api/GetMarket/4846', function(err, response, body) {
        if (err) {
          self.node.log.error(err);
        }
        if (!err && response.statusCode === 200) {
          self.cryptopiaRate = parseFloat(JSON.parse(body).Data.LastPrice);
        }
        res.jsonp({
          status: 200,
          data: {
            binance: self.binanceRate * self.cryptopiaRate
          }
        });
      });
    });
  } else {
    res.jsonp({
      status: 200,
      data: { 
        binance: self.binanceRate * self.cryptopiaRate
      }
    });
  }

};

module.exports = CurrencyController;
