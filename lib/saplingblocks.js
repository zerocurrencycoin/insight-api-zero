'use strict';

var Common = require('./common');

function SaplingBlockController(node) {
  this.node = node;
  this.common = new Common({log: this.node.log});
}

SaplingBlock.prototype.show = function(req, res) {
  var self = this;
  var blockQty = parseInt(req.query.blockQty);

  this.getSaplingBlocks(req.params.height, nBlocks, function(err, result) {
    if (err) {
      return self.common.handleErrors(err, res);
    }
    res.jsonp(result);
  });
};

WitnessController.prototype.getSaplingBlocks = function(height, blockQty, callback) {
  this.node.services.bitcoind.getSaplingBlocks(height, blockQty, function(err, result) {
    if (err) {
      return callback(err);
    }
    callback(null, result);
  });
};

module.exports = WitnessController;
