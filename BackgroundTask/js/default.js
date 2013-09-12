//// THIS CODE AND INFORMATION IS PROVIDED "AS IS" WITHOUT WARRANTY OF
//// ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING BUT NOT LIMITED TO
//// THE IMPLIED WARRANTIES OF MERCHANTABILITY AND/OR FITNESS FOR A
//// PARTICULAR PURPOSE.
////
//// Copyright (c) Microsoft Corporation. All rights reserved

(function () {
    "use strict";

    var sampleTitle = "Background Task Sample";

    var scenarios = [
        { url: "/html/javascript-background-task.html", title: "Sample background task in JavaScript" },
    ];

    function activated(eventObject) {

        //
        // Initialize background task state.
        //

        BackgroundTaskSample.initializeBackgroundTaskState();

        BackgroundTaskSample.registerServicingCompleteTask();

        if (eventObject.detail.kind === Windows.ApplicationModel.Activation.ActivationKind.launch) {
            // Use setPromise to indicate to the system that the splash screen must not be torn down
            // until after processAll and navigate complete asynchronously.
            eventObject.setPromise(WinJS.UI.processAll().then(function () {
                // Navigate to either the first scenario or to the last running scenario
                // before suspension or termination.
                var url = WinJS.Application.sessionState.lastUrl || scenarios[0].url;

                // create the DB and table
                var path = Windows.Storage.ApplicationData.current.localFolder.path + '\\db.sqlite';

                return new Windows.Storage.StorageFile.getFileFromPathAsync(path)
                    .then(function (file) {
                        return file.deleteAsync();
                    }, function (err) {
                        //Rethrow if the error isn't a file not found exception.
                        if (err.hasOwnProperty('number') && err.number !== -2147024894) {
                            throw err;
                        }
                    })
                    .then(function() {
                        return SQLite3JS
                            .openAsync(path)
                            .then(function (db) {
                              return db.runAsync('CREATE TABLE foo (id INT PRIMARY KEY, test TEXT, Bar TEXT NOT NULL)')
                                .then(function (results) {
                                    db.close();
                                    return results;
                                });
                            })
                        .then(function () {
                            return WinJS.Navigation.navigate(url);
                        });
                    });
                }));
        }
    }

    WinJS.Navigation.addEventListener("navigated", function (eventObject) {
        var url = eventObject.detail.location;
        var host = document.getElementById("contentHost");
        // Call unload method on current scenario, if there is one
        host.winControl && host.winControl.unload && host.winControl.unload();
        WinJS.Utilities.empty(host);
        eventObject.detail.setPromise(WinJS.UI.Pages.render(url, host, eventObject.detail.state).then(function () {
            WinJS.Application.sessionState.lastUrl = url;
        }));
    });

    WinJS.Namespace.define("SdkSample", {
        sampleTitle: sampleTitle,
        scenarios: scenarios
    });

    WinJS.Application.addEventListener("activated", activated, false);
    WinJS.Application.start();
})();
