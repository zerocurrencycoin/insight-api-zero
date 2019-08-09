'use strict';

var Common = require('./common');

function SaplingBlockController(node) {
  this.node = node;
  this.common = new Common({log: this.node.log});
}

SaplingBlockController.prototype.show = function(req, res) {
  var self = this;
  var blockQty = parseInt(req.query.blockQty);

  this.getSaplingBlocks(req.params.saplingheight, blockQty, function(err, result) {
    if (err) {
      return self.common.handleErrors(err, res);
    }
    res.jsonp(result);
  });
};

SaplingBlockController.prototype.getSaplingBlocks = function(saplingheight, blockQty, callback) {
  this.node.services.bitcoind.getSaplingBlocks(saplingheight, blockQty, function(err, result) {
    if (err) {
      return callback(err);
    }
    callback(null, result);
  });
};

module.exports = SaplingBlockController;
