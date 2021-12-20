declare module "forecase-builder";

export interface ForecastItem{
    fileName: string;       // "onset-forecast.jpg";
    location: string;       // "Onset, MA" - the title
    lat: string;
    lon: string;
    timeZone: string;       // "America/New_York"
    userAgent: string;      // email address
}

export interface LoggerInterface {
    error(text: string): void;
    warn(text: string): void;
    log(text: string): void;
    info(text: string): void;
    verbose(text: string): void;
    trace(text: string): void;
}

export interface KacheInterface {
    get(key: string): unknown;
    set(key: string, newItem: unknown, expirationTime: number): void;
}

export interface ImageWriterInterface {
    saveFile(fileName: string, buf: Buffer): void;
}

export declare class ForecastBuilder {
    constructor(logger: LoggerInterface, cache: KacheInterface, writer: ImageWriterInterface);
    CreateImages(forecastItem: ForecastItem): Promise<boolean>
}