export default function (Vue, options) {
  /**
   * Segment Source middleware to modify each Segment payload
   */
  function payloadComplianceMiddleware ({ payload, next, integrations }) {
    // Keys to remove from each Segment payload
    const payloadKeysToRemove = {
      properties: ['url', 'path', 'title', 'search', 'referrer']
    }

    // Remove keys from the segment payload to prevent property values from being overwritten by Segment
    const deleteTargetPayloadKeys = (payload, keysToRemove, path = []) => {
      const payloadCopy = { ...payload }

      Object.keys(keysToRemove)
        .forEach((currentKey) => {
          const currentProp = keysToRemove[currentKey]
          path = [...path, currentKey]

          if (Array.isArray(currentProp)) {
            const targetObj = path.reduce((prev, curr) => prev?.[curr], payloadCopy)

            currentProp.forEach((prop) => {
              delete targetObj[prop]
            })
          } else {
            deleteTargetPayloadKeys(payloadCopy, currentProp, path)
          }
        })

      return payloadCopy
    }

    // The context.page.url must be set explicitly based on the URL the event was sent from
    const setExplicitPageUrl = (payload) => {
      const currentUrl = window.location.href

      Object.keys(payload)
        .filter(payloadKey => payloadKey !== 'opts')
        .forEach((key) => {
          payload[key].context.page.url = currentUrl
        })

      return payload
    }

    // These payload keys are identical so both must be updated
    payload.obj = deleteTargetPayloadKeys(payload.obj, payloadKeysToRemove)
    payload.raw = deleteTargetPayloadKeys(payload.raw, payloadKeysToRemove)

    const newPayload = setExplicitPageUrl(payload)

    // Pass the modified payload to the next step
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
