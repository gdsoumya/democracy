const fs          = require('fs')
const path        = require('path')
const assert      = require('chai').assert
const { List, Map }
                  = require('immutable')
const request     = require('request-promise')
const Logger      = require('./logger')
const LOGGER      = new Logger('RemoteDB')
const { isBrowser, ensureDir, DB_DIR, buildFromDirs, fromJS } = require('./utils')

const RemoteDB = class {

  constructor(_host, _port) {
    this.host = _host
    this.port = _port
    this.url  = `http://${_host}:${_port}`
  } 

  async config() {
    return getHTTP('/api/config')
  } 

  /**
   * Post the given JS object to the HTTP endpoint.
   * @param {_apiPath} an absolute `/`-separated path to the API endpoint
   * @param {bodyObj} a Javascript object to stringify and write as data to the given key
   * @return a Promise of the asynchronous HTTP post method.
   */
  async postHTTP(_apiPath, bodyObj) {
    const post_data = JSON.stringify(bodyObj)
    //const post_data = querystring.stringify(bodyObj)
    const post_options = {
      uri: `${this.url}${_apiPath}`,
      body: bodyObj,
      json: true,
      method: 'POST',
      headers: {
          'Content-Length': Buffer.byteLength(post_data),
      }
    }
    return request.post(post_options)
    
  }
 
  async getHTTP(_apiPath) {
    return request({
      uri: `${this.url}${_apiPath}`,
      json: true,
      method: 'GET',
    })
  }

  /**
   * Asynchronous function for writing a key-value pair to a remote REST interface.
   * @param key
   * @param value
   */
  async set(key, value) {
  }

  async get(key, defaultValue) {
  }

}

/**
 * Take the callback action for every level in a hierarchical key space
 */
const getFileKeySpace = (key, cb) => {
  const keySpaces = List(key.split('/')) // in both localstorage and fs, we use UNIX sep
  const dirSpaces = keySpaces.slice(0,-1)
  dirSpaces.map((dir,i) => { cb(keySpaces.slice(0,i+1)) })
  const keyBase = keySpaces.get(-1)
  const dbDir = path.join(`${DB_DIR}`, ...dirSpaces.toJS())

  // Return the base filename and don't add .json extension
  // b/c the latter is only correct behavior for setImmutableKey
  // and this method is also used by getImmutableKey
  return path.join(dbDir, `${keyBase}`)
}

/**
 * set an immutable key, possibly moving aside previous immutable values
 * @param {fullKey} the full path to the key, separated by `/`
 * @param {value} the value to associate, either an Immutable {List}, {Map}, or null
 * @param {overwrite} true if are allowed to move aside previous immutable keys
 */
const setImmutableKey = (fullKey, value, overwrite) => {
  assert(typeof(fullKey) === 'string')
  assert(Map.isMap(value) || List.isList(value) || !value)
 
  // TODO we need the same delete key logic below for browser 
  if (isBrowser()) {
    const valString = (value) ? JSON.stringify(value.toJS()) : value
    localStorage.setItem(fullKey, valString)
  } else {
    ensureDir(DB_DIR)
    const dbFile = getFileKeySpace(fullKey, (keyPrefixes) => {
      ensureDir(path.join(DB_DIR, ...keyPrefixes)) })
    const now = Date.now()

    if (fs.existsSync(`${dbFile}.json`)) {
      if (!value || overwrite) {
        // We never delete, only move to the side
        fs.renameSync(`${dbFile}.json`, `${dbFile}.json.${now}`) 
        if (overwrite) {
          LOGGER.debug(`Overwriting key ${fullKey} with ${value}`)
          // don't return here b/c we need to write the new key file below
        } else {
          LOGGER.debug(`Marking key ${fullKey} deleted at time ${now}`)
          return true
        }
      } else {
        throw new Error(`Key ${dbFile}.json exists and is read-only.`)
      }
    } else if (fs.existsSync(dbFile)) {
      if (!value) {
        LOGGER.debug(`Deleting sub-key ${dbFile}`)
        fs.renameSync(`${dbFile}`, `${dbFile}.${now}`) 
        return true
      } else { 
        throw new Error(`Key ${dbFile} exists and is not a JSON file.`)
      }
    } else if (!value) {
      LOGGER.debug(`Unnecessary deletion of non-existent key ${fullKey}`)
      return true
    }
    const valJS = (Map.isMap(value) || List.isList(value)) ? value.toJS() : value
    LOGGER.debug(`Setting key ${fullKey} value ${JSON.stringify(valJS)}`)
    fs.writeFileSync(`${dbFile}.json`, JSON.stringify(valJS))
    return true
  }

}

function getImmutableKey(fullKey, defaultValue) {
  assert(typeof(fullKey) === 'string')

  if (isBrowser()) {
    const value = fromJS(JSON.parse(localStorage.getItem(fullKey)))
    if (!value) {
      if (defaultValue) return defaultValue
      else { throw new Error(`Key ${fullKey} does not exist.`) }
    }
    return value
  } else {
    const dbFile = getFileKeySpace(fullKey, () => {})
    if (fs.existsSync(`${dbFile}.json`)) {
      return buildFromDirs(`${dbFile}.json`, () => {return false})
    } else if (fs.existsSync(dbFile)) {
      return buildFromDirs(dbFile,
        (fnParts) => { return ((fnParts.length > 1) && (fnParts[1] !== 'json')) })
    } else {
      if (defaultValue) return defaultValue
      else { throw new Error(`Key ${dbFile} does not exist.`) }
    }
  }
}  

module.exports = {
  RemoteDB       : RemoteDB,
  setImmutableKey: setImmutableKey,
  getImmutableKey: getImmutableKey,
}