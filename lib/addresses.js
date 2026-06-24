'use strict';

var bitcore = require('bitcore-lib-zero');
var async = require('async');
var TxController = require('./transactions');
var Common = require('./common');

// --- Crash #3 hardening (oversized-response OOM) ---------------------------
// One Express response.send() built a ~163 MB string on a ~1.4 GB Node-8 heap
// and aborted the process. The doors are unpaginated address responses: the
// address summary's full txid list, and the utxo/multiutxo arrays for a hot
// address. We bound the txid list, and size-check every array response before
// serialization, returning a clean 413 instead of allocating a giant buffer.
//
// MAX_RESPONSE_BYTES is the real OOM guard: it catches ANY response by its
// serialized size regardless of element count, and stays the hard backstop.
// The count caps below are sized to serve real-world hot addresses fully while
// remaining well under that byte ceiling. Calibrated against the busiest live
// address observed (a pool payout wallet, ~79.5k txAppearances / ~79.5k UTXOs,
// whose full /utxo body measures ~30 MB) so it serves end-to-end; 100k UTXOs is
// ~38 MB, still under the 50 MB wall, and 100k txids is ~7 MB.
var MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB ceiling, well under heap
var MAX_TXIDS = 100000;                     // cap txids in an address summary
var MAX_UTXOS = 100000;                     // cap utxo array length

// Serialize, size-check, and send — or 413 if the body would be too large to
// build safely. Centralizes the guard so every array endpoint uses it.
function sendChecked(self, res, data) {
  var body;
  try {
    body = JSON.stringify(data);
  } catch (e) {
    return self.common.handleErrors({
      message: 'Failed to serialize response: ' + (e.message || e),
      code: 1
    }, res);
  }
  if (body.length > MAX_RESPONSE_BYTES) {
    return res.status(413).jsonp({
      error: 'Response too large; use pagination (from/to or pageNum).'
    });
  }
  res.set('Content-Type', 'application/json').send(body);
}

function AddressController(node) {
  this.node = node;
  this.txController = new TxController(node);
  this.common = new Common({log: this.node.log});
}

AddressController.prototype.show = function(req, res) {
  var self = this;
  var options = {
    noTxList: parseInt(req.query.noTxList)
  };

  if (req.query.from && req.query.to) {
    options.from = parseInt(req.query.from);
    options.to = parseInt(req.query.to);
  }

  this.getAddressSummary(req.addr, options, function(err, data) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    sendChecked(self, res, data);
  });
};

AddressController.prototype.balance = function(req, res) {
  this.addressSummarySubQuery(req, res, 'balanceSat');
};

AddressController.prototype.totalReceived = function(req, res) {
  this.addressSummarySubQuery(req, res, 'totalReceivedSat');
};

AddressController.prototype.totalSent = function(req, res) {
  this.addressSummarySubQuery(req, res, 'totalSentSat');
};

AddressController.prototype.unconfirmedBalance = function(req, res) {
  this.addressSummarySubQuery(req, res, 'unconfirmedBalanceSat');
};

AddressController.prototype.addressSummarySubQuery = function(req, res, param) {
  var self = this;
  this.getAddressSummary(req.addr, {}, function(err, data) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    res.jsonp(data[param]);
  });
};

AddressController.prototype.getAddressSummary = function(address, options, callback) {

  this.node.getAddressSummary(address, options, function(err, summary) {
    if(err) {
      return callback(err);
    }

    // Bound the txid list. A hot address can carry hundreds of thousands of
    // txids; serializing them all is the OOM door. If the list is truncated,
    // flag it so callers know to page via from/to.
    var txids = summary.txids;
    var txidsTruncated = false;
    if (Array.isArray(txids) && txids.length > MAX_TXIDS) {
      txids = txids.slice(0, MAX_TXIDS);
      txidsTruncated = true;
    }

    var transformed = {
      addrStr: address,
      balance: summary.balance / 1e8,
      balanceSat: summary.balance,
      totalReceived: summary.totalReceived / 1e8,
      totalReceivedSat: summary.totalReceived,
      totalSent: summary.totalSpent / 1e8,
      totalSentSat: summary.totalSpent,
      unconfirmedBalance: summary.unconfirmedBalance / 1e8,
      unconfirmedBalanceSat: summary.unconfirmedBalance,
      unconfirmedTxApperances: summary.unconfirmedAppearances, // misspelling - ew
      txApperances: summary.appearances, // yuck
      transactions: txids
    };
    if (txidsTruncated) {
      transformed.txAppearancesTruncated = true;
      transformed.txAppearancesLimit = MAX_TXIDS;
    }

    callback(null, transformed);
  });
};

AddressController.prototype.checkAddr = function(req, res, next) {
  req.addr = req.params.addr;
  this.check(req, res, next, [req.addr]);
};

AddressController.prototype.checkAddrs = function(req, res, next) {
  if(req.body.addrs) {
    req.addrs = req.body.addrs.split(',');
  } else {
    req.addrs = req.params.addrs.split(',');
  }

  this.check(req, res, next, req.addrs);
};

AddressController.prototype.check = function(req, res, next, addresses) {
  var self = this;
  if(!addresses.length || !addresses[0]) {
    return self.common.handleErrors({
      message: 'Must include address',
      code: 1
    }, res);
  }

  for(var i = 0; i < addresses.length; i++) {
    try {
      var a = new bitcore.Address(addresses[i]);
    } catch(e) {
      return self.common.handleErrors({
        message: 'Invalid address: ' + e.message,
        code: 1
      }, res);
    }
  }

  next();
};

AddressController.prototype.utxo = function(req, res) {
  var self = this;

  this.node.getAddressUnspentOutputs(req.addr, {}, function(err, utxos) {
    if(err) {
      return self.common.handleErrors(err, res);
    } else if (!utxos.length) {
      return res.jsonp([]);
    }
    if (utxos.length > MAX_UTXOS) {
      return res.status(413).jsonp({
        error: 'Too many unspent outputs (' + utxos.length + '); narrow the query.'
      });
    }
    sendChecked(self, res, utxos.map(self.transformUtxo.bind(self)));
  });
};

AddressController.prototype.multiutxo = function(req, res) {
  var self = this;
  this.node.getAddressUnspentOutputs(req.addrs, true, function(err, utxos) {
    if(err && err.code === -5) {
      return res.jsonp([]);
    } else if(err) {
      return self.common.handleErrors(err, res);
    }

    if (utxos.length > MAX_UTXOS) {
      return res.status(413).jsonp({
        error: 'Too many unspent outputs (' + utxos.length + '); narrow the query.'
      });
    }
    sendChecked(self, res, utxos.map(self.transformUtxo.bind(self)));
  });
};

AddressController.prototype.transformUtxo = function(utxoArg) {
  var utxo = {
    address: utxoArg.address,
    txid: utxoArg.txid,
    vout: utxoArg.outputIndex,
    scriptPubKey: utxoArg.script,
    amount: utxoArg.satoshis / 1e8,
    satoshis: utxoArg.satoshis
  };
  if (utxoArg.height && utxoArg.height > 0) {
    utxo.height = utxoArg.height;
    utxo.confirmations = this.node.services.bitcoind.height - utxoArg.height + 1;
  } else {
    utxo.confirmations = 0;
  }
  if (utxoArg.timestamp) {
    utxo.ts = utxoArg.timestamp;
  }
  return utxo;
};

AddressController.prototype._getTransformOptions = function(req) {
  return {
    noAsm: parseInt(req.query.noAsm) ? true : false,
    noScriptSig: parseInt(req.query.noScriptSig) ? true : false,
    noSpent: parseInt(req.query.noSpent) ? true : false
  };
};

AddressController.prototype.multitxs = function(req, res, next) {
  var self = this;

  var options = {
    from: parseInt(req.query.from) || parseInt(req.body.from) || 0
  };

  options.to = parseInt(req.query.to) || parseInt(req.body.to) || parseInt(options.from) + 10;

  self.node.getAddressHistory(req.addrs, options, function(err, result) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    var transformOptions = self._getTransformOptions(req);

    self.transformAddressHistoryForMultiTxs(result.items, transformOptions, function(err, items) {
      if (err) {
        return self.common.handleErrors(err, res);
      }
      sendChecked(self, res, {
        totalItems: result.totalCount,
        from: options.from,
        to: Math.min(options.to, result.totalCount),
        items: items
      });
    });

  });
};

AddressController.prototype.transformAddressHistoryForMultiTxs = function(txinfos, options, callback) {
  var self = this;

  var items = txinfos.map(function(txinfo) {
    return txinfo.tx;
  }).filter(function(value, index, self) {
    return self.indexOf(value) === index;
  });

  async.map(
    items,
    function(item, next) {
      self.txController.transformTransaction(item, options, next);
    },
    callback
  );
};



module.exports = AddressController;
