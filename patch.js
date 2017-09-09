const loaderUtils = require('loader-utils')
const path = require('path')
const ReactDOM = require('react-dom/server')

module.exports = function () {}
module.exports.pitch = function(request) {
  this.cacheable && this.cacheable(true)
  this.addDependency(this.resourcePath)
  return `
import React from 'react'
import ReactDOM from 'react-dom/server'

function update() {
  document.body.innerHTML = ReactDOM.renderToStaticMarkup(
    React.createElement(
      require(${loaderUtils.stringifyRequest(this, '!!' + request)}).default
    )
  )
}

update(update)

if(module.hot) {
  module.hot.accept(${loaderUtils.stringifyRequest(this, '!!' + request)}, update)
  //module.hot.dispose(update)
}
`
}
