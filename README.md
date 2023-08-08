# forecast-builder
Generates an image with the weather forecast for a given lat/lon in the US
test.ts shows how to use the module

The normal use of this module is to build an npm module that can be used as part of a bigger progress.

index.d.ts describes the interface for the module

The LoggerInterface, KacheInterface and ImageWriterInterface interfaces are dependency injected into the module.  Simple versions are provided and used by the test wrapper.

Once instanciated, the CreateImages() method can be called with a json object containging details about the location to generate the image for.  See test.ts for an example.

To use the test wrapper to build a screen, run the following command.  
```
$ npm start

or

$ node app.js 
```

