// https://github.com/jhuckaby/webcamjs/issues/112
Webcam.set( 'constraints', {
        optional: [
            { minWidth: 600 }
        ]
    } );
Webcam.set({
  width: 320,
  height: 240,
  dest_width: 1280,
  dest_height: 960
});
Webcam.attach( '#live_camera' );
function take_snapshot() {
    Webcam.snap( function(data_uri) {
      // Show the image under the video feed
      document.getElementById('snapshot').innerHTML = '<img style="width:320px; height:240px;" src="'+data_uri+'"/>';

      // Insert data into input field as Base64 encode
      var raw_image_data = data_uri.replace(/^data\:image\/\w+\;base64\,/, '');
      document.getElementById('image_file').value = raw_image_data;
    } );
}


