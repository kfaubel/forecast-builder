/* eslint-disable @typescript-eslint/no-explicit-any */
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
}

export class ForecastBuilder {
    private logger: LoggerInterface;
    private cache: KacheInterface;
    private writer: ImageWriterInterface;
    private userAgent: string;

    constructor(logger: LoggerInterface, cache: KacheInterface, writer: ImageWriterInterface, userAgent: string) {
        this.logger = logger;
        this.cache = cache; 
        this.writer = writer;
        this.userAgent = userAgent;
    }

    public async CreateImages(forecastItem: ForecastItem): Promise<boolean>{
        try {
            const forecastImage: ForecastImage = new ForecastImage(this.logger, this.cache, this.writer, this.userAgent);

            const result = await forecastImage.getImage(forecastItem.lat, forecastItem.lon, forecastItem.location);

            if (result !== null && result.imageData !== null ) {
                this.logger.info(`ForecastBuilder: Writing: ${forecastItem.fileName}`);
                this.writer.saveFile(forecastItem.fileName, result.imageData.data);
            } else {
                this.logger.warn(`ForecastBuilder: No image for ${forecastItem.fileName}`);
                return false;
            }
        } catch (e: any) {
            this.logger.error(`ForecastBuilder: Error getting forecast data for ${forecastItem.fileName}: ${e.stack}`);
            return false;
        }

        return true;
    }
}
