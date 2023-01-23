// Segment source middleware: https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/middleware/
function payloadComplianceMiddleware({ payload, next, integrations }) {
  // Keys to remove from each segment payload's properties object
  const payloadPropertiesKeysToRemove = ['url', 'path', 'title', 'search', 'referrer']

  const deletePayloadPropertiesKeys = (payload) => {
    // Get the current URL from the page where the event was sent from
    const currentUrl = window.location.href

    console.warn('[nuxt-segment] Reached payload compliance-middleware')

    // Iterate through `payloadPropertiesKeysToRemove` and remove the properties object keys from the payload `obj` object
    payloadPropertiesKeysToRemove.forEach((propertyKey) => {
      if (payload.obj.properties) {
        delete payload.obj.properties[propertyKey]
      } else if (payload.obj.traits) {
        delete payload.obj.traits[propertyKey]
      }
    })

    // Explicitly set the url
    payload.obj.context.page.url = currentUrl

    return payload
  }

  deletePayloadPropertiesKeys(payload)

  console.warn('[nuxt-segment] Modified payload:')
  console.warn(payload)

  // Pass the modified payload off to the next step
  next(payload)
}

module.exports = {
  install (Vue, options) {
    if (!options.disabled && (!options.writeKey || options.writeKey.length === 0)) {
      console.warn('Please enter a Segment Write Key')
      return
    }

    const analytics = window.analytics = window.analytics || []

    if (analytics.initialize) {
      return
    }

    if (analytics.invoked) {
      if (window.console && console.error) {
        console.error('Segment snippet included twice.')
      }
      return
    }

    analytics.invoked = true

    analytics.methods = [
      'trackSubmit',
      'trackClick',
      'trackLink',
      'trackForm',
      'pageview',
      'identify',
      'reset',
      'group',
      'track',
      'ready',
      'alias',
      'debug',
      'page',
      'once',
      'off',
      'on',
      'addSourceMiddleware',
      'addIntegrationMiddleware',
      'setAnonymousId',
      'addDestinationMiddleware'
    ]

    analytics.factory = function (method) {
      return function () {
        const args = Array.prototype.slice.call(arguments)
        args.unshift(method)
        analytics.push(args)
        return analytics
      }
    }

    for (let i = 0; i < analytics.methods.length; i++) {
      const key = analytics.methods[i]
      analytics[key] = analytics.factory(key)
    }

    analytics._writeKey = options.writeKey
    analytics._cdn = "https://evs.segment.bollandbranch.com"

    analytics.SNIPPET_VERSION = '4.15.3'

    if (window && window.console) {
      window.console.warn('SEGMENT LOGS:')
      window.console.warn(`SNIPPET_VERSION: ${analytics.SNIPPET_VERSION}`)
      window.console.warn(`WRITE KEY: ${analytics._writeKey}`)
    }

    analytics.load = function (key, options) {
      if (document.querySelector('#otms-segment')) { return }
      const script = document.createElement('script')
      script.id = 'otms-segment'
      script.type = 'text/plain'
      script.async = true
      script.src = options.cdnUrl
      script.classList.add('optanon-category-C0003')

      const first = document.getElementsByTagName('script')[0]
      first.parentNode.insertBefore(script, first)
      analytics._loadOptions = options
    }

    // Payload compliance middleware
    analytics.addSourceMiddleware(payloadComplianceMiddleware)
    console.warn('[nuxt-segment] Added source middleware')

    if (!options.disabled) {
      analytics.load(options.writeKey, options.settings)
    }

    if (options.router) {
      options.router.afterEach(function (to, from) {
        window.analytics.page(options.pageCategory || '', to.name || '', {
          path: to.fullPath
        })
      })
    }

    Object.defineProperty(Vue, '$segment', {
      get () { return window.analytics }
    })
    Object.defineProperty(Vue.prototype, '$segment', {
      get () { return window.analytics }
    })
  }
}
