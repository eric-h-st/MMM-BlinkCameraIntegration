/* Magic Mirror
* Module: MMM-BlinkCameraIntegration
*
* By Eric H.
* MIT Licensed.
*/

var NodeHelper = require("node_helper");
const Blink = require("node-blink-security");
const request = require('request');
const Base64 = require('base64-stream');
const streamString = require('stream-string');

var self = null;

module.exports = NodeHelper.create({
    blink: null,
    lastVideoTime: null, 
    latestVideoInterval: null,
    fetchingInProgress: false,

    log: function(message) {
      console.log(self.name + ": " + message);
    },
    logInfo: function (message) {
      console.info(self.name + ": " +message);
    },
    logError: function (message, params) {
      console.error(self.name + ": " +message, params);
    },
  
    socketNotificationReceived: function (notification, payload) {
      switch (notification) {
        case "CONFIG":
          if (!self.blink) {          
            self.config = payload;
            self.lastVideoTime = new Date(0);
            self.blink = new Blink(self.config.email, self.config.password, self.config.deviceId, {
              auth_2FA: true
            });

            self.log("Connecting Blink...");
            self.blink.setupSystem().then(() => {
              self.logInfo("Blink setup done.");
              self.sendSocketNotification("CAMERAS", self.blink._cameras);
            }, (error) => {
              self.blink = null;
              self.logError(error);
            });
          }
          else {
            self.sendSocketNotification("CAMERAS", self.blink._cameras);          
          }
        break;
        case "GET_CAMERA_SNAPSHOTS":
          if (self.blink) {          
              self.getSnapshots().then((results) => {                
                self.sendSocketNotification("CAMERA_SNAPSHOTS", results);
              });
          }
        break;
        case "HANDLE_LATEST_VIDEO_INTERVAL":
          if (payload && payload > 0) {
            self.log("Setting interval to " + payload);
            if (!self.latestVideoInterval) {
              self.fetchLatestVideo();
              self.latestVideoInterval = setInterval(self.fetchLatestVideo, payload);
            }
          }
          else {
            self.log("Suspending interval");
            if (self.latestVideoInterval) {
              clearInterval(self.latestVideoInterval);
              self.latestVideoInterval = null;
            }
          }
        break;
        default: 
        break;
      }
    },
    
    getSnapshots: function() {
      const promises = [];
      
      Object.values(self.blink.cameras).forEach(camera => {
        promises.push(new Promise((resolve, reject) => {
          const encoder = new Base64.Base64Encode();
          streamString(request({
              url: camera._thumb,
              headers: self.blink._auth_header,
              json: true
            }, (err, response, body) => {
            if (err || response.statusCode < 200 || response.statusCode > 299) {
              reject(new Error("Failed to get image"));
            } 
          }).pipe(encoder)).then((data) => {
            return resolve({deviceId: camera.id, datetime:camera._updated_at, base64Image: "data:image/jpeg;base64," + data});
          }).catch(err => {
            self.logError(err);
          });
        }));
      });
      
      return Promise.all(promises)
      .then(results => {
        return results;
      });
    },

    fetchLatestVideo: function() {
      if (self.fetchingInProgress)
        return;
      if (self.blink) {      
        self.fetchingInProgress = true;
        self.log("Checking for new videos since: " + self.lastVideoTime);
        self.blink.getVideos(0, self.lastVideoTime).then((results) => {
          self.lastVideoTime = new Date(Date.now());
          if (results && results.media && results.media.length > 0) {
            self.getVideo(results.media[0]).then((data) => {
              self.sendSocketNotification("LATEST_VIDEO", data);
              self.fetchingInProgress = false;
            }).catch(err => {
              self.logError(err);
              self.fetchingInProgress = false;
            });
          }
        });
      }
    },

    getVideo: function(videoInfo) {    
      const encoder = new Base64.Base64Encode();
      url = self.blink.urls.base_url + videoInfo.media;
      return new Promise((resolve, reject) => {
        streamString(request({
            url: url,
            headers: self.blink._auth_header,
            json: true
          }, (err, response, body) => {
          if (err || response.statusCode < 200 || response.statusCode > 299) {
            reject(new Error("Failed to get video " + err));
          } 
        }).pipe(encoder)).then((data) => {
          resolve({deviceId: videoInfo.device_id, mediaId: videoInfo.id, datetime:videoInfo.created_at, base64Image: "data:video/mp4;base64," + data});
        });
      });
    },
 
	  start: function() {
		  self = this;
    }
});
