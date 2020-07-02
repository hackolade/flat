var isBuffer = require('is-buffer')

module.exports = flatten
flatten.flatten = flatten
flatten.unflatten = unflatten

function keyIdentity (key) {
  return key
}

function getTransformKey (opts) {
  return opts.arrayAndObject
    ? keyIdentity
    : opts.transformKey || keyIdentity
}

function flatten (target, opts) {
  opts = opts || {}

  const delimiter = opts.delimiter || '.'
  const maxDepth = opts.maxDepth
  const transformKey = getTransformKey(opts)
  const arrayAndObject = opts.arrayAndObject
  const customWrapper = opts.customWrapper
  const output = {}

  function checkArrayItemIndex (key, parent) {
    const isNumber = !isNaN(key)
    const isArray = Array.isArray(parent)
    return isNumber && isArray
  }

  function wrapArrayItemIndex (index) {
    if (customWrapper) {
      return `${customWrapper}${index}${customWrapper}`
    }
    return `[${index}]`
  }

  function step (object, prev, currentDepth) {
    currentDepth = currentDepth || 1
    Object.keys(object).forEach(function (key) {
      const value = object[key]
      const isarray = opts.safe && Array.isArray(value)
      const type = Object.prototype.toString.call(value)
      const isbuffer = isBuffer(value)
      const isobject = (
        type === '[object Object]' ||
        type === '[object Array]'
      )
      const isArrayItemIndex = checkArrayItemIndex(key, object)
      const newKey = (arrayAndObject && isArrayItemIndex)
        ? wrapArrayItemIndex(key)
        : key

      const fullKey = prev
        ? prev + delimiter + transformKey(newKey)
        : transformKey(newKey)

      if (!isarray && !isbuffer && isobject && Object.keys(value).length &&
        (!opts.maxDepth || currentDepth < maxDepth)) {
        return step(value, fullKey, currentDepth + 1)
      }

      output[fullKey] = value
    })
  }

  step(target)

  return output
}

function unflatten (target, opts) {
  opts = opts || {}

  const delimiter = opts.delimiter || '.'
  const overwrite = opts.overwrite || false
  const transformKey = getTransformKey(opts)
  const arrayAndObject = opts.arrayAndObject
  const customWrapper = opts.customWrapper
  const result = {}

  const isbuffer = isBuffer(target)
  if (isbuffer || Object.prototype.toString.call(target) !== '[object Object]') {
    return target
  }

  function parseIndex (key, regex, wrapper = '[') {
    const matchWrapper = key.match(regex)
    const wrappedIndex = matchWrapper && matchWrapper[0]
    
    if (wrappedIndex) {
      return wrappedIndex.slice(wrapper.length, -(wrapper.length))
    }
    return key
  }

  function parseArrayItem (key) {
    if (key === undefined) {
      return key
    }

    if (!arrayAndObject) {
      return key
    }

    if (customWrapper) {
      const regex = new RegExp(`${customWrapper}.*?${customWrapper}`)
      return parseIndex(key, regex, customWrapper)
    }
    
    const regex = /^\[0\]|\[[1-9][0-9]*\]$/
    return parseIndex(key, regex)
  }

  // safely ensure that the key is
  // an integer.
  function getkey (key) {
    const parsedArrayItem = parseArrayItem(key)
    const parsedKey = Number(key)
    const optsObject = arrayAndObject || opts.object

    if (parsedArrayItem !== key) {
      return Number(parsedArrayItem)
    }

    return (
      isNaN(parsedKey) ||
      key.indexOf('.') !== -1 ||
      optsObject
    ) ? key
      : parsedKey
  }

  function addKeys (keyPrefix, recipient, target) {
    return Object.keys(target).reduce(function (result, key) {
      result[keyPrefix + delimiter + key] = target[key]

      return result
    }, recipient)
  }

  function isEmpty (val) {
    const type = Object.prototype.toString.call(val)
    const isArray = type === '[object Array]'
    const isObject = type === '[object Object]'

    if (!val) {
      return true
    } else if (isArray) {
      return !val.length
    } else if (isObject) {
      return !Object.keys(val).length
    }
  }

  target = Object.keys(target).reduce((result, key) => {
    const type = Object.prototype.toString.call(target[key])
    const isObject = (type === '[object Object]' || type === '[object Array]')
    if (!isObject || isEmpty(target[key])) {
      result[key] = target[key]
      return result
    } else {
      return addKeys(
        key,
        result,
        flatten(target[key], opts)
      )
    }
  }, {})

  Object.keys(target).forEach(function (key) {
    const split = key.split(delimiter).map(transformKey)
    let key1 = getkey(split.shift())
    let key2 = getkey(split[0])
    let recipient = result

    while (key2 !== undefined) {
      const type = Object.prototype.toString.call(recipient[key1])
      const isobject = (
        type === '[object Object]' ||
        type === '[object Array]'
      )

      // do not write over falsey, non-undefined values if overwrite is false
      if (!overwrite && !isobject && typeof recipient[key1] !== 'undefined') {
        return
      }

      if ((overwrite && !isobject) || (!overwrite && recipient[key1] == null)) {
        recipient[key1] = (
          typeof key2 === 'number' &&
          !opts.object ? [] : {}
        )
      }

      recipient = recipient[key1]
      if (split.length > 0) {
        key1 = getkey(split.shift())
        key2 = getkey(split[0])
      }
    }

    // unflatten again for 'messy objects'
    recipient[key1] = unflatten(target[key], opts)
  })

  return result
}
