/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { LoggerInterface } from "./Logger";
import { ForecastImage } from "./ForecastImage";
import { KacheInterface } from "./Kache";
import { ImageWriterInterface } from "./SimpleImageWriter";

export interface ForecastItem{
    fileName: string;       // "onset-forecast.jpg";
    location: string;       // "Onset, MA" - the title
    lat: string;
    lon: string;
    timeZone: string;       // "America/New_York"
    userAgent: string;      // email address
}

export class ForecastBuilder {
    private logger: LoggerInterface;
    private cache: KacheInterface;
    private writer: ImageWriterInterface;

    constructor(logger: LoggerInterface, cache: KacheInterface, writer: ImageWriterInterface) {
        this.logger = logger;
        this.cache = cache; 
        this.writer = writer;
    }

    public async CreateImages(forecastItem: ForecastItem): Promise<boolean>{
        try {
            const forecastImage: ForecastImage = new ForecastImage(this.logger, this.cache);

            const result = await forecastImage.getImage(forecastItem.lat, forecastItem.lon, forecastItem.location,forecastItem.userAgent);

            if (result !== null && result.imageData !== null ) {
                this.logger.info(`CreateImages: Writing: ${forecastItem.fileName}`);
                this.writer.saveFile(forecastItem.fileName, result.imageData.data);
            } else {
                this.logger.error("CreateImages: No imageData returned from ForecastImage.getImage()");
                return false;
            }
        } catch (e) {
            if (e instanceof Error) {
                this.logger.error(`ForecastData: Error getting forecast data: ${e.message}`);
                this.logger.error(`${e.stack}`);
            } else {
                this.logger.error(`ForecastData: Error getting forecast data: ${e}`);
            }
            return false;
        }

        return true;
    }
}
