import { ForecastBuilder, ForecastItem} from "./ForecastBuilder";
import { Logger } from "./Logger";
import { Kache } from "./Kache";
import { SimpleImageWriter } from "./SimpleImageWriter";
import dotenv from "dotenv";

async function run() {
    dotenv.config();  // Load var from .env into the environment
    
    const logger: Logger = new Logger("forecast-builder", "verbose"); 
    const cache: Kache = new Kache(logger, "forecast-cache.json");
    const simpleImageWriter: SimpleImageWriter = new SimpleImageWriter(logger, "./images");

    const userAgent: string | undefined = process.env.USER_AGENT;
    if (typeof userAgent !== "string" ) {
        logger.error("USER_AGENT (email address) is not specified in the environment.  Set it in .env");
        return;
    }
   
    const forecastBuilder: ForecastBuilder = new ForecastBuilder(logger, cache, simpleImageWriter, userAgent);
    
    const forecastData1: ForecastItem = {
        fileName: "onset-forecast.jpg",
        location: "Onset, MA",
        lat: "41.750",
        lon: "-70.658",
        timeZone: "America/New_York"
    };
    
    const forecastData2: ForecastItem = {
        fileName: "dunstable-forecast.jpg",
        location: "Dunstable, MA",
        lat: "42.68",
        lon: "-71.474",
        timeZone: "America/New_York"
    };
    
    const forecastData3: ForecastItem = {
        fileName: "victor-forecast.jpg",
        location: "Victor, NY",
        lat: "42.958",
        lon: "-77.428",
        timeZone: "America/New_York"
    };
    
    const forecastData4: ForecastItem = {
        fileName: "louisville-forecast.jpg",
        location: "Louisville, CO",
        lat: "39.981",
        lon: "-105.131",
        timeZone: "America/Denver"
    };

    let success: boolean = true;
    success  = await forecastBuilder.CreateImages(forecastData1) && success;
    logger.verbose("=============================================================");
    success  = await forecastBuilder.CreateImages(forecastData2) && success;
    logger.verbose("=============================================================");
    success  = await forecastBuilder.CreateImages(forecastData3) && success;
    logger.verbose("=============================================================");
    success  = await forecastBuilder.CreateImages(forecastData4) && success;
    logger.verbose("=============================================================");

    logger.info(`test.ts: Done: ${success  ? "successfully" : "failed"}`); 

    return success ? 0 : 1;
}

run();