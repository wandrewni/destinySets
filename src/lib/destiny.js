import { sortBy, has } from 'lodash';

import { setUser } from 'app/lib/telemetry';
import { getEnsuredAccessToken } from 'app/lib/destinyAuth';
import { trackError, trackBreadcrumb } from 'app/lib/telemetry';
import * as ls from 'app/lib/ls';

const XUR_URL = 'https://api.destiny.plumbing/xur';

const log = require('app/lib/log')('http');

const componentProfiles = 100; // eslint-disable-line
const componentVendorReceipts = 101; // eslint-disable-line
const componentProfileInventories = 102; // eslint-disable-line
const componentProfileCurrencies = 103; // eslint-disable-line
const componentProfileProgressions = 104; // eslint-disable-line
const componentCharacters = 200; // eslint-disable-line
const componentCharacterInventories = 201; // eslint-disable-line
const componentCharacterProgressions = 202; // eslint-disable-line
const componentCharacterRenderData = 203; // eslint-disable-line
const componentCharacterActivities = 204; // eslint-disable-line
const componentCharacterEquipment = 205; // eslint-disable-line
const componentItemInstances = 300; // eslint-disable-line
const componentItemObjectives = 301; // eslint-disable-line
const componentItemPerks = 302; // eslint-disable-line
const componentItemRenderData = 303; // eslint-disable-line
const componentItemStats = 304; // eslint-disable-line
const componentItemSockets = 305; // eslint-disable-line
const componentItemTalentGrids = 306; // eslint-disable-line
const componentItemCommonData = 307; // eslint-disable-line
const componentItemPlugStates = 308; // eslint-disable-line
const componentVendors = 400; // eslint-disable-line
const componentVendorCategories = 401; // eslint-disable-line
const componentVendorSales = 402; // eslint-disable-line
const componentCollectibles = 800;
const componentRecords = 900;

const PROFILE_COMPONENTS = [
  componentProfiles,
  componentProfileInventories,
  componentCharacters,
  componentCharacterInventories,
  componentCharacterEquipment,
  componentItemObjectives,
  componentItemSockets,
  componentProfileProgressions,
  componentCharacterProgressions,
  componentCollectibles,
  componentRecords
];

const VENDOR_COMPONENTS = [
  componentItemSockets,
  componentItemPlugStates,
  componentVendorSales
];

let DEBUG_STORE = {
  profiles: []
};

export function get(url, opts) {
  return fetch(url, opts).then(res => res.json());
}

function getEnsuredAccessTokenNoop() {
  return Promise.resolve(null);
}

export function getDestiny(pathname, opts = {}, postBody) {
  const url = `https://www.bungie.net${pathname}`;

  opts.headers = opts.headers || {};
  opts.headers['x-api-key'] = process.env.REACT_APP_API_KEY;

  const authTokenFn = opts._noAuth
    ? getEnsuredAccessTokenNoop
    : getEnsuredAccessToken;

  return authTokenFn()
    .then(accessToken => {
      if (accessToken) {
        opts.headers['Authorization'] = `Bearer ${accessToken}`;
      }

      if (postBody) {
        opts.method = 'POST';
        if (typeof postBody === 'string') {
          opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          opts.body = postBody;
        } else {
          opts.headers['Content-Type'] = 'application/json';
          opts.body = JSON.stringify(postBody);
        }
      }

      log(`REQUEST: ${pathname}`, opts);

      return get(url, opts);
    })
    .then(resp => {
      // const resp = {
      //   ErrorCode: 5,
      //   ErrorStatus: 'SystemDisabled',
      //   Message: 'This system is temporarily disabled for maintenance.',
      //   MessageData: '{}'
      // };

      log(`RESPONSE: ${pathname}`, resp);

      if (resp.ErrorStatus === 'DestinyAccountNotFound') {
        return null;
      }

      if (has(resp, 'ErrorCode') && resp.ErrorCode !== 1) {
        const cleanedUrl = url.replace(/\/\d+\//g, '/_/');
        const err = new Error(
          'Bungie API Error ' +
            resp.ErrorStatus +
            ' - ' +
            resp.Message +
            '\nURL: ' +
            cleanedUrl
        );

        err.response = resp;
        err.data = resp;

        if (resp.ErrorStatus !== 'SystemDisabled') {
          trackError(err);
        } else {
          trackBreadcrumb({
            message: 'Bungie API Error',
            category: 'api',
            level: 'error',
            data: { url, ...resp }
          });
        }

        throw err;
      }

      const result = resp.Response || resp;

      return result;
    });
}

export function getVendors(membership, characterId) {
  const { membershipType, membershipId } = membership;

  return getDestiny(
    `/Platform/Destiny2/${membershipType}/Profile/${membershipId}/Character/${characterId}/Vendors/?components=${VENDOR_COMPONENTS.join(
      ','
    )}`
  ).catch(err => {
    console.error('Error fetching vendors for', {
      membershipType,
      membershipId,
      characterId
    });

    console.error(err);
    return null;
  });
}

export function getProfile({ membershipType, membershipId }) {
  return getDestiny(
    `/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=${PROFILE_COMPONENTS.join(
      ','
    )}`
  );
}

export function getExtendedProfile(ship) {
  let profile;
  return getProfile(ship)
    .then(_profile => {
      profile = _profile;

      DEBUG_STORE.profiles.push(profile);

      if (!profile) {
        log('Empty profile, ignoring', { ship });
        return null;
      }

      return Promise.all(
        Object.keys(profile.characters.data).map(characterId => {
          return getVendors(ship, characterId);
        })
      );
    })
    .then(characterVendors => {
      if (!characterVendors) {
        return null;
      }

      // TODO: why are vendors occasionally not returning for some people?
      profile.$vendors = { data: {} };
      Object.keys(profile.characters.data).forEach((characterId, index) => {
        if (characterVendors[index]) {
          profile.$vendors.data[characterId] = characterVendors[index];
        }
      });

      return profile;
    });
}

export function getCurrentProfiles() {
  let bungieNetUser;

  return getDestiny('/Platform/User/GetMembershipsForCurrentUser/')
    .then(body => {
      bungieNetUser = body.bungieNetUser;
      DEBUG_STORE.membershipsForCurrentUser = body;

      setUser(bungieNetUser);

      return Promise.all(body.destinyMemberships.map(getExtendedProfile));
    })
    .then(profiles => {
      log('profiles:', profiles);
      const sortedProfiles = sortBy(
        profiles
          .filter(Boolean)
          .filter(profile => profile.profile.data.versionsOwned !== 0),
        profile => {
          return new Date(profile.profile.data.dateLastPlayed).getTime();
        }
      ).reverse();

      log('sortedProfiles:', sortedProfiles);

      const payload = {
        profiles: sortedProfiles,
        bungieNetUser
      };

      try {
        ls.saveProfiles(payload);
      } catch (err) {
        console.error('Unable to save profiles to localStorage');
        console.error(err);
      }

      return payload;
    });
}

export function getLastProfile(data) {
  const { id, type } = ls.getPreviousAccount();
  return (
    data.profiles.find(profile => {
      return (
        profile.profile.data.userInfo.membershipId === id &&
        profile.profile.data.userInfo.membershipType === type
      );
    }) || data.profiles[0]
  );
}

export function getCurrentProfilesWithCache(cb) {
  const cached = ls.getProfiles();

  if (cached) {
    cb(null, cached, true);
  }

  getCurrentProfiles()
    .then(resp => {
      cb(null, resp, false);
    })
    .catch(err => cb(err));
}

export function getCurrentProfile() {
  return getCurrentProfiles().then(data => {
    const latestProfile = data.profiles.sort((profileA, profileB) => {
      return (
        new Date(profileB.profile.data.dateLastPlayed) -
        new Date(profileA.profile.data.dateLastPlayed)
      );
    })[0];

    log('latestProfile:', latestProfile);

    // TODO: validate that all fields got their data
    return latestProfile;
  });
}

function cachedGet(url, cb) {
  const cached = ls.getCachedUrl(url);

  if (cached) {
    cb(null, cached);
  }

  return get(url)
    .then(data => {
      ls.saveCachedUrl(url, data);
      cb(null, data);
    })
    .catch(err => cb(err));
}

export function xur(cb) {
  return cachedGet(XUR_URL, (err, xurData) => {
    if (err) {
      return cb(err);
    }

    const isLive =
      window.location.href.indexOf('forceXur') > -1 || xurData.isLive;

    const payload =
      isLive && xurData.itemHashes.length > 0
        ? { items: xurData.itemHashes, location: xurData.location }
        : { items: [] };

    cb(null, payload);
  });
}
