import Vue from 'vue'
import Segment from '@dansmaculotte/vue-segment'
import * as Cookies from 'es-cookie'

const DEFAULT_USE_ROUTER = true
const OPTIONS = '<%= JSON.stringify(options) %>'

function checkIfBoolean (param) {
  return typeof param === 'boolean'
}

function moduleOptionRouter(moduleOptions) {
  return checkIfBoolean(moduleOptions.useRouter) ? moduleOptions.useRouter : undefined
}

function configOptionRouter($config) {
  return checkIfBoolean($config.SEGMENT_USE_ROUTER) ? $config.SEGMENT_USE_ROUTER : undefined
}

function shouldUseRouter(moduleOptions, $config) {
  return moduleOptionRouter(moduleOptions) || configOptionRouter($config) || DEFAULT_USE_ROUTER
}

function getScrollPercent() {
  const h = document.documentElement
  const b = document.body
  const st = 'scrollTop'
  const sh = 'scrollHeight'
  return ((h[st] || b[st]) / ((h[sh] || b[sh]) - h.clientHeight)) * 100 || 0
}

function getPageCategory(pagePath) {
  let category = !pagePath || pagePath === '/' ? 'homepage' : pagePath
  category =
    category === 'collections' || category === 'products'
      ? category.slice(0, -1)
      : category
  return category
}

function segmentCategory(to) {
  return getPageCategory(to.path.split('/')[1]) ||''
}

/**
 * Get the document referer from the client if we have it.
 *
 * @return {String}
 *          The name of the referred website.
 * */
function getDocumentReferrer(){
  let referrer = ''
  const referrerKey = '_bb_user_referrer'
  if (process.client) {
    referrer =
      document.referrer?.length > 0
        ? document.referrer
        : window.originalDocumentReferrer
  }

  // Resolves Issue: Referrer value assigned in GA disappears after a few page views
  if (referrer?.length) {
    sessionStorage.setItem(referrerKey, referrer)
  }

  return referrer?.length ? referrer : sessionStorage.getItem(referrerKey)
}

/**
 * Get the UTM params from the query.
 * */
function getUtm(params) {
  // If not params then just return an empty object.
  if (!params || typeof params === 'undefined') return {}
  if ( params['utm_source'] || params['utm_medium'] ) {
    const urlSearchParams = new URLSearchParams(params)
    return Object.fromEntries(urlSearchParams.entries())
  }
}

/**
 * Set up the Segment metadata for the page and track events.
 *
 * _session_id is only set on the bollandbranch.com domain so won't come on local or preview testing without being set
 * up as a preview on the root domain.
 * */
function getSegmentMetadata() {
  // Get the module options to we can pass the write key. The write key is a public key.
  const moduleOptions = JSON.parse(OPTIONS)

  const gaCID = Cookies.get('_ga')
  const gaID = Cookies.get('_gid')
  const dyID = Cookies.get('_dyid')
  const fbp = Cookies.get('_fbp')
  const fbc = Cookies.get('_fbc')
  const sessionId =  Cookies.get('_session_id')
  const userData = Cookies.get('user-data')
  let userID = ''
  let email = ''
  if(userData) {
    const userObj = JSON.parse(userData)
    userID = userObj.userId
    email = userObj.customerEmail
  }

  return {
    session_id: sessionId,
    user_id: userID,
    email: email,
    dyid: dyID,
    ga_gid: gaID,
    ga_cid: gaCID,
    fbp: fbp,
    fbc: fbc,
    segment_write_key: moduleOptions.writeKey
  }
}

/**
 * Get the segment page data
 * */
function getSegmentPageData(to){
  return {
    referrer: getDocumentReferrer(),
    domain: window.location.host || '',
    name:  (typeof document !== 'undefined' && document.title) || '',
    path: to?.path || to?.fullpath || '',
    search: '?' + to?.fullPath?.split('?')?.[0] || '',
    title:  (typeof document !== 'undefined' && document.title) || '',
    url: window.location.href || '',
    ...getUtm(to?.query)
  }
}

/**
* Get the current Amplitude ID. If one does not get exist then we set one.
* */
function getAmplitudeSessionId() {
  try {
    const amplitudeIdKey = '_amplitude_session_id'
    const thirtyMinsInMs = 1800000 // 30 * 60 * 1000
    const now = new Date()
    const timeNow = now.getTime()
    const newExpiry = new Date(now.getTime() + thirtyMinsInMs)

    const currentAmplitudeId = Cookies.get(amplitudeIdKey)
    if (currentAmplitudeId) {
      Cookies.set(amplitudeIdKey, currentAmplitudeId, {
        expires: newExpiry,
        path: '/',
        domain: 'bollandbranch.com'
      })

      return currentAmplitudeId
    }

    // set new id
    Cookies.set(amplitudeIdKey, timeNow, {
      expires: newExpiry,
      path: '/',
      domain: 'bollandbranch.com'
    })

    return timeNow
  } catch (error) {
    console.error('amplitude id error')
  }
}

/**
* Get the Amplitude integrations to add to the track events.
 * @return <Object> - the object with the integrations.
* */
function getAmplitudeIntegrations() {
  return {
    Amplitude: {
      session_id: getAmplitudeSessionId()
    }
  }
}

function startPageTracking(app) {
  app.router.afterEach((to, from) => {

    const redirectCookie = Cookies.get('redirect-path')
    if (redirectCookie) {
      // Split the redirect cookie array by the comma into an array.
      const resultCookieArray = redirectCookie.split(',')
      if (resultCookieArray.length > 1) {
        resultCookieArray.splice(0, 1)
      }
      resultCookieArray.forEach(item => {
        const toObj = {
          path: item
        }
        window.analytics.page(segmentCategory(toObj),(typeof document !== 'undefined' && document.title) || '',
          {
            ...getSegmentMetadata(),
            ...getSegmentPageData(toObj),
            path: toObj.path,
            site: 'pwa'
          },
          getAmplitudeIntegrations()
        )
        window.analytics.track(
          'Page Viewed',
          {
            ...getSegmentMetadata(),
            ...getSegmentPageData(toObj),
            category: segmentCategory(toObj),
            scroll_depth: getScrollPercent()
          },
          getAmplitudeIntegrations()
        )
      })
      // Remove the cookie once we have sent the track/page calls.
      // This stops it from happening on every page view.
      Cookies.remove('redirect-path')
      Cookies.remove('redirects-cleaned')
    }

    try {
      window.analytics.page(segmentCategory(to), (typeof document !== 'undefined' && document.title) || '', {
          ...getSegmentMetadata(),
          ...getSegmentPageData(to),
          path: to.fullPath,
          site: 'pwa',
        },
        getAmplitudeIntegrations()
      )
      window.analytics.track(
        'Page Viewed',
        {
          ...getSegmentPageData(to),
          ...getSegmentMetadata(),
          category: segmentCategory(to),
          scroll_depth: getScrollPercent()
        },
        getAmplitudeIntegrations())
    } catch (e) {
      console.error(e);
    }
  })
}

export default function (context, inject) {
  const { app, store, $config } = context

  const moduleOptions = JSON.parse(OPTIONS)

  const options = {
    writeKey: moduleOptions.writeKey || ($config && $config.SEGMENT_WRITE_KEY),
    disabled: moduleOptions.disabled || ($config && $config.SEGMENT_DISABLED) || false,
    settings: moduleOptions.settings,
  }

  const useRouter = shouldUseRouter(moduleOptions, $config)

  // We remove the Vue plugin router to stop double firing.
  /*  if (useRouter && app.router) {
    options.router = app.router
  }*/

  Vue.use(Segment, options)

  if (store) {
    store.$segment = Vue.$segment
  }

  context.$segment = Vue.$segment

  if (Vue.$segment) {
    inject('segment', Vue.$segment)
  }
  startPageTracking(app, $config)
}
