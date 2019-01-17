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
    
    request('https://api.coinmarketcap.com/v1/ticker/zero/?convert=USD', function(err, response, body) {
        var self = this;
        if (err) {
            self.node.log.error(err);
        }
        if (!err && response.statusCode === 200) {
            try {
                var data = JSON.parse(body);
            } catch(ee) {
                console.log(ee);
                var data = {};
            }

            if (Object.hasOwnProperty.call(data[0], "price_usd")) {
                    self.cryptopiaRate = parseFloat(data[0].price_usd);
                    console.log('data[0].price_usd',data[0].price_usd,self.cryptopiaRate)
                    res.jsonp({
                        status: 200,
                        data: {
                            binance: self.cryptopiaRate
                        }
                    });

            }
        }
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
