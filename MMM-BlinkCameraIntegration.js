/* Magic Mirror
* Module: MMM-BlinkCameraIntegration
*
* By Eric H.
* MIT Licensed.
*/

var self = null;

Module.register('MMM-BlinkCameraIntegration', {
    defaults: {
        email: null,
        password: null,
		deviceId: null,
		displaySnapshots: true,
		displayLatestVideoMode: 1,
		motionPollingIntervalInSeconds: 30, // Minimum 15 seconds
		videoRepeats: 1,
	},
	displayLatestVideoModes: {
		NONE: 0,
		IMMEDIATELY: 1,
		UPONUSERPRESENCE: 2
	},	
	initiated: false,
	cameras: null,
	images: null,
	latestVideo: null,
	latestVideoId: null,
	playLatestVideo: false,
	latestVideoPlayCount: 0,
	  
      	// Override socket notification handler.
	socketNotificationReceived: function(notification, payload) {
		switch (notification) {
			case "CAMERAS":
				self.cameras = payload;
				self.images = null;
				this.sendSocketNotification('GET_CAMERA_SNAPSHOTS');	
			break;
			case "CAMERA_SNAPSHOTS":
				self.images = payload;				
				self.updateDom();
				if (self.config.displayLatestVideoMode != self.displayLatestVideoModes.NONE) {
					this.sendSocketNotification('HANDLE_LATEST_VIDEO_INTERVAL', Math.max(self.config.motionPollingIntervalInSeconds, 15) * 1000);	
				}
			break;
			case "LATEST_VIDEO":
				if (payload) {
					if (!self.latestVideo || self.latestVideo.mediaId != payload.mediaId) {
						self.latestVideo = payload;
						self.latestVideoPlayCount = (self.config.videoRepeats > 0) ? self.config.videoRepeats : -1;
						if (self.config.displayLatestVideoMode == self.displayLatestVideoModes.IMMEDIATELY) {
							self.playLatestVideo = true;
							self.updateDom();
						}
						this.sendNotification("BLINK_MOTION_VIDEO",{dateime:payload.datetime});
					}
				}
			break;
			default: 
			break;
		}
	},
	notificationReceived: function(notification, payload) {
		switch (notification) {
			case "USER_PRESENCE":
				if (self.latestVideo && self.config.displayLatestVideoMode == self.displayLatestVideoModes.UPONUSERPRESENCE) {				
					self.playLatestVideo = true;
					self.updateDom();
				}
			break;
		}
	}, 

	getStyles: function() {
		return [
			"MMM-BlinkCameraIntegration.css"
		];
	},
	
	getDom: function() {
		const divWrapper = document.createElement("div");
		divWrapper.className = "MMM-BlinkCameraIntergration";
		if (!self.config.displaySnapshots && self.config.displayLatestVideoMode == self.displayLatestVideoModes.NONE)
			return;

		if (self.cameras && self.images) {
			for (var i=0; i < self.images.length; i++) {
				const imageDivWrapper = document.createElement("div");
				imageDivWrapper.className = "blinkPane";
				
				const titleWrapper = document.createElement("div");
				titleWrapper.className = "cameraName";
				const dateTimeWrapper = document.createElement("div");
				dateTimeWrapper.className = "videoDateTime";

				const camera = self.cameras[self.images[i].deviceId];
				if (camera) {
					titleWrapper.innerHTML = camera._name;
					imageDivWrapper.appendChild(titleWrapper);				
				}
				if (self.latestVideo && self.playLatestVideo && self.latestVideo.deviceId == self.images[i].deviceId) {
					dateTimeWrapper.innerHTML = new Date(Date.parse(self.latestVideo.datetime)).toLocaleString();
					imageDivWrapper.appendChild(dateTimeWrapper);				

					const videoWrapper = document.createElement("video");
					videoWrapper.className = "video";
					videoWrapper.setAttribute("autoplay", "");
					videoWrapper.setAttribute("muted", "");
					videoWrapper.loaded = function() {
						videoWrapper.play();
					};			
					videoWrapper.onended = function() {
					if (self.latestVideoPlayCount > 0)
						self.latestVideoPlayCount--;
					if (self.latestVideoPlayCount < 0 || self.latestVideoPlayCount > 0) {
							videoWrapper.pause();
							videoWrapper.currentTime = 0;
							videoWrapper.load();
						}
						else {
							self.updateDom(10000);
						}
					};
					videoWrapper.autoplay = true;
					const videoSourceWrapper = document.createElement("source");
					videoSourceWrapper.className = "videoSource";
					videoSourceWrapper.type = "video/mp4";
					videoSourceWrapper.src = self.latestVideo.base64Image;
					videoWrapper.appendChild(videoSourceWrapper);
					imageDivWrapper.appendChild(videoWrapper);			
					videoWrapper.load();
					self.latestVideo = null;
					self.playLatestVideo = false;
					divWrapper.appendChild(imageDivWrapper);
				}
				else {				
					if (self.config.displaySnapshots) {
						dateTimeWrapper.innerHTML = new Date(Date.parse(self.images[i].datetime)).toLocaleString();
						imageDivWrapper.appendChild(dateTimeWrapper);				

						const imageWrapper = document.createElement("img");
						imageWrapper.className = "snapshot";
						imageWrapper.src = self.images[i].base64Image;
						imageDivWrapper.appendChild(imageWrapper);
						divWrapper.appendChild(imageDivWrapper);
					}
				}
			}
		}

		if (!self.initiated) {
			this.sendSocketNotification('CONFIG', this.config);	
			self.initiated = true;
		}
		return divWrapper;
	},

	suspend: function () {
		this.sendSocketNotification('HANDLE_LATEST_VIDEO_INTERVAL', 0);	
	},

	resume: function () {
		this.sendSocketNotification('HANDLE_LATEST_VIDEO_INTERVAL', Math.max(self.config.motionPollingIntervalInSeconds, 15) * 1000);	
	},

	start: function() {
		Log.info("Starting module: " + this.name);
		self = this;
	}
});