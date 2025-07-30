const { createRequestHandler } = require('@netlify/plugin-nextjs')

exports.handler = createRequestHandler({
  build: {
    publish: '.next',
    functions: 'netlify/functions'
  }
}) 