(function () {
  window.HatyaiRescueConfig = Object.assign(
    {
      publicBaseUrl: "",
      droneBaseUrl: "",
      supabaseUrl: "",
      supabasePublishableKey: "",
      trainedAiMatchesUrl: "http://127.0.0.1:4173/api/pi/matches",
      yoloDetectionsUrl: "http://127.0.0.1:4173/api/yolo/detections",
      waterLevelUrl: "",
      waterGeofenceName: "พื้นที่ภารกิจหาดใหญ่",
      waterGeofenceCenterLat: 7.0086,
      waterGeofenceCenterLng: 100.4747,
      waterGeofenceRadiusM: 30000,
      droneAccessHash: "8b2387aed4073512b9adb21cde8ca29d581247569e25933312b3248c9e362994"
    },
    window.HatyaiRescueConfig || {}
  );
})();
