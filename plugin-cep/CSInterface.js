/**
 * CSInterface.js — minimal stub for Revision AI CEP panel
 * Full library: https://github.com/Adobe-CEP/CSInterface
 */

var CSInterface = (function () {
  'use strict'

  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    if (typeof __adobe_cep__ !== 'undefined') {
      __adobe_cep__.evalScript(script, callback || function () {})
    } else if (callback) {
      callback('undefined')
    }
  }

  CSInterface.prototype.getHostEnvironment = function () {
    if (typeof __adobe_cep__ !== 'undefined') {
      return JSON.parse(__adobe_cep__.getHostEnvironment())
    }
    return null
  }

  return CSInterface
})()
