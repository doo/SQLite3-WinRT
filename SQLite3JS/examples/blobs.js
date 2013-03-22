(function () {
  "use strict";

  var dbPath = Windows.Storage.ApplicationData.current.localFolder.path + '\\db.sqlite',
      Package = Windows.ApplicationModel.Package;

  // Wait for DOM to be ready
  WinJS.Utilities.ready().then(function () {
    return SQLite3JS.openAsync(dbPath);
  }).then(function (db) {
    return db.runAsync('CREATE TABLE IF NOT EXISTS images (id INT PRIMARY KEY, image BLOB)')
    .then(function () {
      // Get an image to insert into the database as blob
      return Package.current.installedLocation.getFileAsync("images\\logo.png");
    }).then(function (file) {
      return Windows.Storage.FileIO.readBufferAsync(file);
    }).then(function (buffer) {
      return db.runAsync('INSERT INTO images (image) VALUES (?)', [buffer]);
    }).then(function () {
      var div;
      return db.eachAsync('SELECT image FROM images', function (row) {
        div = document.createElement("img");
        div.src = 'data:image/png;base64,' + row.image;
        document.body.appendChild(div);
      });
    }).then(function () {
      return db.runAsync("DROP TABLE images");
    }).then(function () {
      db.close();
    });
  });

}());