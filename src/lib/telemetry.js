import * as ls from 'app/lib/ls';
import { getEnsuredAccessToken } from 'app/lib/destinyAuth';

const log = require('app/lib/log')('telemetry');

function getNameFromBungieProfile(bungieNetProfile) {
  const { psnDisplayName, xboxDisplayName, uniqueName } = bungieNetProfile;

  const nameArr = [
    psnDisplayName && `psn:${psnDisplayName}`,
    xboxDisplayName && `xbox:${psnDisplayName}`
  ].filter(Boolean);

  if (!nameArr.length) {
    nameArr.push(uniqueName);
  }

  const name = nameArr.join(' ');

  return name;
}

export function getDebugProfile(path) {}

export function saveDebugInfo(debugData, pathPrefix = 'debug') {}

export function setUser(bungieNetProfile) {
  const { membershipId } = bungieNetProfile;
  const { ga, Raven } = window;

  ls.saveUID(membershipId);

  const uid = ls.getUID();
  const name = getNameFromBungieProfile(bungieNetProfile);

  ga && ga('set', '&uid', uid);
  ga && ga('set', 'userId', uid);

  Raven &&
    Raven.setUserContext({
      id: uid,
      username: name
    });
}

export function trackError(...args) {
  const { Raven } = window;

  if (!Raven) {
    return null;
  }

  Raven.captureException(...args);
}

export function setExtraUserContext(data) {
  const { Raven } = window;

  if (!Raven) {
    return null;
  }

  Raven.setExtraContext(data);
}

export function trackBreadcrumb(data) {
  const { Raven } = window;

  if (!Raven) {
    return null;
  }

  Raven.captureBreadcrumb(data);
}

export function errorPrompt(ev) {
  if (ev && ev.preventDefault) {
    ev.preventDefault();
  }

  const { Raven } = window;

  if (!Raven) {
    window.alert(
      'Unable to load error library. Maybe an adblocker interferred?'
    );
    return null;
  }

  Raven.showReportDialog();
}

export function sendProfileStats() {
  if (process.env.REACT_APP_PREVENT_STATS) {
    return Promise.resolve();
  }

  return getEnsuredAccessToken()
    .then(accessToken => {
      return fetch(
        `https://stats.destinysets.com/update-inventory?accessToken=${encodeURIComponent(
          accessToken
        )}`,
        { method: 'POST' }
      );
    })
    .then(r => r.json())
    .then(d => log('Sent profile stats', d));
}
