import { ForecastBuilder, ForecastItem} from "./ForecastBuilder";
import { Logger } from "./Logger";
import { Kache } from "./Kache";
import { SimpleImageWriter } from "./SimpleImageWriter";
import dotenv from "dotenv";

async function run() {
    dotenv.config();  // Load var from .env into the environment
    
    const logger: Logger = new Logger("forecast-builder", "info"); 
    const cache: Kache = new Kache(logger, "forecast-cache.json");
    const simpleImageWriter: SimpleImageWriter = new SimpleImageWriter(logger, ".");

    const userAgent: string | undefined = process.env.USER_AGENT;
    if (typeof userAgent !== "string" ) {
        logger.error("USER_AGENT (email address) is not specified in the environment.  Set it in .env");
        return;
    }
   
    const forecastBuilder: ForecastBuilder = new ForecastBuilder(logger, cache, simpleImageWriter);
    const forecastData: ForecastItem = {
        fileName: "onset-forecast.jpg",
        location: "Onset, MA",
        lat: "41.85",
        lon: "-70.65",
        timeZone: "America/New_York",
        userAgent: userAgent,
    };

    await forecastBuilder.CreateImages(forecastData);
    
    logger.info("Done"); 
}

run();