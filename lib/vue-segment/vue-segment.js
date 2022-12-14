export default function (Vue, options) {
  // Segment source middleware: https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/middleware/
  function payloadComplianceMiddleware ({ payload, next, integrations }) {
    // Keys to remove from each segment payload's properties object
    const payloadPropertiesKeysToRemove = ['url', 'path', 'title', 'search', 'referrer']

    const deletePayloadPropertiesKeys = (payload) => {
      // Get the current URL from the page where the event was sent from
      const currentUrl = window.location.href
      const payloadCopy = { ...payload }

      // Iterate through `payloadPropertiesKeysToRemove` and remove the properties object keys listed in `payloadPropertiesKeysToRemove`
      payloadPropertiesKeysToRemove.forEach((propertyKey) => {
        delete payloadCopy.obj.properties[propertyKey]
      })

      // Explicitly set the url
      payloadCopy.obj.context.page.url = currentUrl

      return payloadCopy
    }

    const newPayload = deletePayloadPropertiesKeys(payload)

    // Pass the modified payload off to the next step
    next(newPayload)
  }

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
    'addSourceMiddleware',
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
    'on'
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

  analytics.SNIPPET_VERSION = '4.15.2'

  analytics.load = function (key, options) {
    if (document.querySelector('#otms-segment')) { return }
    const script = document.createElement('script')
    script.id = 'otms-segment'
    script.type = 'text/plain'
    script.async = true
    script.src = process.env.SEGMENT_TRACKING_CDN
    script.classList.add('optanon-category-C0003')

    const first = document.getElementsByTagName('script')[0]
    first.parentNode.insertBefore(script, first)
    analytics._loadOptions = options
  }

  if (!options.disabled) {
    // Add Source Middleware prior to loading Segment
    analytics.addSourceMiddleware(payloadComplianceMiddleware)
    analytics.load(options.writeKey, options.settings)
  }

  if (options.router) {
    options.router.afterEach((to, from) => {
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
