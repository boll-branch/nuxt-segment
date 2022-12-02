import Vue from 'vue'
import Segment from '@boll-and-branch/vue-segment'
import * as Cookies from 'es-cookie'

const DEFAULT_USE_ROUTER = true
const OPTIONS = '<%= JSON.stringify(options) %>'

function checkIfBoolean(param) {
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
  return getPageCategory(to.path.split('/')[1]) || ''
}

/**
 * Get the document referer from the client if we have it.
 *
 * @return {String}
 *          The name of the referred website.
 * */
function getDocumentReferrer() {
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
  if (params['utm_source'] || params['utm_medium']) {
    const urlSearchParams = new URLSearchParams(params)
    return Object.fromEntries(urlSearchParams.entries())
  }
}

/**
 * Set up the Segment metadata for the page and track events.
 *
 * _session_id is only set on the bollandbranch.com domain so won't come on local or preview testing without being set
 * up as a preview on the root domain.
 *
 * @param {Object} $config - Nuxt App config, provides runtime environment variables that are available to both the client and server.
 * @param {string} $config.BUILD_TIMESTAMP - The current build timestamp for an app instance.
 *
 * */
function getSegmentMetadata($config) {
  // Get the module options to we can pass the write key. The write key is a public key.
  const moduleOptions = JSON.parse(OPTIONS)

  // Build timestamp for tracking what build a user is on
  const currentBuildTimestamp = $config.BUILD_TIMESTAMP
  const userData = Cookies.get('user-data')
  let userID = ''
  let email = ''
  if (userData) {
    const userObj = JSON.parse(userData)
    userID = userObj.userId
    email = userObj.customerEmail
  }

  return {
    ...window._bbSegmentMetaData,
    bb_build_timestamp: currentBuildTimestamp,
    user_id: `${userID}`,
    email: email,
    segment_write_key: moduleOptions.writeKey
  }
}

/**
 * Get the segment page data
 * */
async function getSegmentPageData(to) {

  // We need to get the token from the env and encode it for the fetch.
  const token = `${process.env.THE_QUIBBLER_USERNAME}:${process.env.THE_QUIBBLER_PASSWORD}`
  const quibblerURL = process.env.THE_QUIBBLER_URL
  const encodedToken = Buffer.from(token).toString('base64')
  let json = []

  // Try and get the additional data from the quibbler
  try {
    const contentCache = await fetch(
      quibblerURL + '/api/content/' + to?.params?.collectionHandle,
      {
        headers: {
          Authorization: `Basic ${encodedToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      }
    )
    const jsonPayload = await contentCache.json()
    json = JSON.parse(jsonPayload)
  } catch (e) {}

  return {
    referrer: getDocumentReferrer(),
    domain: window.location.host || '',
    name: (typeof document !== 'undefined' && document.title) || '',
    path: to?.path || to?.fullpath || '',
    search: '?' + to?.fullPath?.split('?')?.[0] || '',
    title: (typeof document !== 'undefined' && document.title) || '',
    url: window.location.href || '',
    userAgent: window.navigator.userAgent || '',
    publishedVersion: json.publishedVersion || "",
    publishedAt: json.publishedAt || "",
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
    test_id: Cookies.get('_bb_test_id'),
    Amplitude: {
      session_id: getAmplitudeSessionId()
    }
  }
}

async function startPageTracking(app, $config) {
  console.log('nuxt segment locally');
  app.router.afterEach((to, from) => {

    const redirectCookie = Cookies.get('redirect-path')
    /*
    * If we have a redirect cookie then we need to manage firing the page view event manually
    * for those pages.
    *
    * After we are done, we delete the redirect cookie.
    * */
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
        window.analytics.page(segmentCategory(toObj), (typeof document !== 'undefined' && document.title) || '',
          {
            ...getSegmentMetadata($config),
            ...getSegmentPageData(toObj),
            path: toObj.path,
            site: 'pwa'
          },
          getAmplitudeIntegrations()
        )


        // window.analytics.track(
        //   'Page Viewed',
        //   {
        //     ...getSegmentMetadata($config),
        //     ...getSegmentPageData(toObj),
        //     category: segmentCategory(toObj),
        //     scroll_depth: getScrollPercent()
        //   },
        //   getAmplitudeIntegrations()
        // )

      })
      // Remove the cookie once we have sent the track/page calls.
      // This stops it from happening on every page view.
      Cookies.remove('redirect-path')
      Cookies.remove('redirects-cleaned')
    }

    try {
      setTimeout(async () => {
        window.analytics.page(segmentCategory(to), (typeof document !== 'undefined' && document.title) || '', {
            ...getSegmentMetadata($config),
            ...await getSegmentPageData(to),
            path: to.fullPath,
            site: 'pwa',
          },
          getAmplitudeIntegrations()
        )
      }, 1000)
    } catch (e) {
      console.error(e);
    }
  })
}

export default function (context, inject) {
  const {app, store, $config} = context

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
