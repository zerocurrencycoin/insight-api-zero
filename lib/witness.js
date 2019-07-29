'use strict';

var Common = require('./common');

function WitnessController(node) {
  this.node = node;
  this.common = new Common({log: this.node.log});
}

WitnessController.prototype.show = function(req, res) {
  var self = this;
  var index = parseInt(req.query.index);

  this.getSaplingWitness(req.params.wtxid, index, function(err, result) {
    if (err) {
      return self.common.handleErrors(err, res);
    }
    res.jsonp(result);
  });
};

WitnessController.prototype.getSaplingWitness = function(wtxid, index, callback) {
  this.node.services.bitcoind.getSaplingWitness(wtxid, index, function(err, result) {
    if (err) {
      return callback(err);
    }
    var info = {
      height: result.height,
      txhash: result.txhash,
      sheildedoutputindex: result.sheildedoutputindex,
      witness: result.witness
    };
    callback(null, info);
  });
};

module.exports = WitnessController;
