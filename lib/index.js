"use strict";

var _fs = _interopRequireDefault(require("fs"));

var _signatures = _interopRequireDefault(require("../signatures.json"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/** @type {(function(Buffer):FileTypeResult)[]} */
const customFunctions = [];

const noopCallback = () => {};

const DEFAULT_BUFFER_SIZE = 500;
let validatedSignaturesCache = false;
/**
 * @typedef {Object} FileTypeResult
 * @property {string} ext
 * @property {string} mime
 * @property {string=} iana
 */

/** */

class DetectFileType {
  /**
   * @param {string} filePath 
   * @param {number=} bufferLength 
   * @param {function(Error=,FileTypeResult)} callback 
   */
  static fromFile(filePath, bufferLength, callback) {
    if (typeof bufferLength === 'function') {
      callback = bufferLength;
      bufferLength = undefined;
    }

    DetectFileType._getFileSize(filePath, (err, fileSize) => {
      if (err) {
        return callback(err);
      }

      _fs.default.open(filePath, 'r', (err, fd) => {
        if (err) {
          return callback(err);
        }

        DetectFileType.fromFd(fd, Math.min(bufferLength || DEFAULT_BUFFER_SIZE, fileSize), callback);
      });
    });
  }
  /**
   * @param {number} fd 
   * @param {number=} bufferLength 
   * @param {function(Error=,FileTypeResult)} callback 
   */


  static fromFd(fd, bufferLength, callback) {
    if (typeof bufferLength === 'function') {
      callback = bufferLength;
      bufferLength = undefined;
    }

    let bufferSize = bufferLength;

    if (!bufferSize) {
      bufferSize = DEFAULT_BUFFER_SIZE;
    }

    const buffer = new Buffer(bufferSize);

    _fs.default.read(fd, buffer, 0, bufferSize, 0, (err, data) => {
      _fs.default.close(fd, noopCallback);

      if (err) {
        return callback(err);
      }

      DetectFileType.fromBuffer(buffer, callback);
    });
  }
  /**
   * @param {Buffer} buffer 
   * @param {function(Error=,FileTypeResult)} callback 
   */


  static fromBuffer(buffer, callback) {
    let result = null;

    if (!validatedSignaturesCache) {
      validatedSignaturesCache = DetectFileType._validateSigantures();
    }

    if (Array.isArray(validatedSignaturesCache)) {
      return callback(validatedSignaturesCache);
    }

    if (!(buffer instanceof Buffer)) buffer = Buffer.from(buffer);

    _signatures.default.every(signature => {
      let detection = DetectFileType._detect(buffer, signature.rules);

      if (detection) {
        result = DetectFileType._getRuleDetection({}, signature, detection);
        return false;
      }

      return true;
    });

    if (result === null) {
      customFunctions.every(fn => {
        const fnResult = fn(buffer);

        if (fnResult) {
          result = fnResult;
          return false;
        }

        ;
        return true;
      });
    }

    callback(null, result);
  }

  static addSignature(signature) {
    validatedSignaturesCache = false;

    _signatures.default.push(signature);
  }
  /** @param {function(Buffer):FileTypeResult} fn */


  static addCustomFunction(fn) {
    customFunctions.push(fn);
  }
  /** @private */


  static _detect(buffer, rules, type, searchData) {
    if (!type) {
      type = 'and';
    }

    let detectedRule = true;
    rules.every(rule => {
      let result = true; // Process search rule

      if (typeof rule.search === 'object') {
        let searchRule = rule.search; // Elevate bytes into a buffer

        if (!(searchRule.bytes instanceof Buffer)) searchRule.bytes = Buffer.from(searchRule.bytes, typeof searchRule.bytes === 'string' ? 'hex' : null); // Figure out start/end

        let start = searchRule.start || 0;
        let end = searchRule.end; // Offset start/end based on a previous search

        if (searchRule.hasOwnProperty('search_ref')) {
          const index = searchData ? searchData.get(searchRule.search_ref) : -1;

          if (index === -1) {
            start = -1;
          } else {
            start += index;
            end += index;
          }
        } // Limit end to buffer length (otherwise an error is thrown)


        end = Math.min(typeof end === 'number' ? end : buffer.length, buffer.length); // Search for those bytes

        let index = start === -1 ? -1 : buffer.indexOf(searchRule.bytes, undefined, undefined, start, end);

        if (index < 0) {
          detectedRule = this._getRuleDetection(detectedRule, false);
          return this._isReturnFalse(detectedRule, type);
        }

        searchData = searchData || new Map();
        searchData.set(searchRule.id, index);
      }

      if (rule.type === 'or') {
        result = this._detect(buffer, rule.rules, 'or', searchData);
      } else if (rule.type === 'and') {
        result = this._detect(buffer, rule.rules, 'and', searchData);
      } else if (rule.type === 'default') {
        result = rule;
      } else {
        // Elevate bytes into a buffer
        if (!(rule.bytes instanceof Buffer)) rule.bytes = Buffer.from(rule.bytes, typeof rule.bytes === 'string' ? 'hex' : null); // Figure out start/end

        let start = rule.start || 0;
        let end = rule.end; // Offset start/end based on a previous search

        if (rule.hasOwnProperty('search_ref')) {
          const index = searchData ? searchData.get(rule.search_ref) : -1;

          if (index === -1) {
            start = -1;
          } else {
            start += index;
            end += index;
          }
        } // Limit end to buffer length (otherwise an error is thrown)


        end = Math.min(typeof end === 'number' ? end : buffer.length, buffer.length);

        if (start < 0) {
          result = false;
        } else if (rule.type === 'equal') {
          result = buffer.compare(rule.bytes, undefined, undefined, start, end) === 0;
        } else if (rule.type === 'notEqual') {
          result = buffer.compare(rule.bytes, undefined, undefined, rule.start || 0, end) !== 0;
        } else if (rule.type === 'contains') {
          result = buffer.slice(rule.start || 0, rule.end || buffer.length).includes(rule.bytes);
        } else if (rule.type === 'notContains') {
          result = !buffer.slice(rule.start || 0, rule.end || buffer.length).includes(rule.bytes);
        }
      }

      if (result === true) result = rule;
      detectedRule = this._getRuleDetection(detectedRule, result);
      return this._isReturnFalse(detectedRule, type);
    });
    return detectedRule;
  }
  /** @private */


  static _isReturnFalse(isDetected, type) {
    if (!isDetected && type === 'and') {
      return false;
    }

    if (isDetected && type === 'or') {
      return false;
    }

    return true;
  }
  /** @private */


  static _validateRuleType(rule) {
    const types = ['or', 'and', 'contains', 'notContains', 'equal', 'notEqual', 'default'];
    return types.indexOf(rule.type) !== -1;
  }
  /** @private */


  static _validateSigantures() {
    let invalidSignatures = _signatures.default.map(signature => {
      return this._validateSignature(signature);
    }).filter(Boolean);

    if (invalidSignatures.length) {
      return invalidSignatures;
    }

    return true;
  }
  /** @private */


  static _validateSignature(signature) {
    if (!('type' in signature)) {
      return {
        message: 'signature does not contain "type" field',
        signature
      };
    }

    if (!('rules' in signature)) {
      return {
        message: 'signature does not contain "rules" field',
        signature
      };
    }

    const validations = this._validateRules(signature.rules);

    if (!('ext' in signature) && !validations.hasExt) {
      return {
        message: 'signature does not contain "ext" field',
        signature
      };
    }

    if (!('mime' in signature) && !validations.hasMime) {
      return {
        message: 'signature does not contain "mime" field',
        signature
      };
    }

    if (Array.isArray(validations)) {
      return {
        message: 'signature has invalid rule',
        signature,
        rules: validations
      };
    }
  }
  /** @private */


  static _validateRules(rules) {
    let validations = rules.map(rule => {
      let isRuleTypeValid = this._validateRuleType(rule);

      if (!isRuleTypeValid) {
        return {
          message: 'rule type not supported',
          rule
        };
      }

      if ((rule.type === 'or' || rule.type === 'and') && !('rules' in rule)) {
        return {
          message: 'rule should contains "rules" field',
          rule
        };
      }

      if (rule.type === 'or' || rule.type === 'and') {
        return this._validateRules(rule.rules);
      }

      return {
        hasExt: 'ext' in rule,
        hasMime: 'mime' in rule
      };
    });
    let invalid = validations.filter(x => x.message);
    let valid = validations.filter(x => !x.message);
    if (!invalid) return invalid;
    return {
      hasExt: valid.some(x => x.hasExt),
      hasMime: valid.some(x => x.hasMime)
    };
  }
  /** @private */


  static _getFileSize(filePath, callback) {
    _fs.default.stat(filePath, (err, stat) => {
      if (err) {
        return callback(err);
      }

      return callback(null, stat.size);
    });
  }
  /** @private */


  static _getRuleDetection() {
    let v = false;

    for (let i = 0, len = arguments.length; i < len; i++) {
      let detection = arguments[i];

      if (typeof detection === 'boolean') {
        v = detection ? v || detection : false;
      } else {
        v = typeof v === 'boolean' ? {} : v;
        if ('ext' in detection) v.ext = detection.ext;
        if ('mime' in detection) v.mime = detection.mime;
        if ('iana' in detection) v.iana = detection.iana;
      }
    }

    return v;
  }

}
/** @type {typeof DetectFileType} */


module.exports = DetectFileType;