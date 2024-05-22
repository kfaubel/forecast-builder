/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { LoggerInterface } from "./Logger";
import { KacheInterface } from "./Kache";

// 
// take lat/lon and find the grid https://api.weather.gov/points/41.85,-70.65
// lookup the forecast data for the grid https://api.weather.gov/gridpoints/BOX/88,55/forecast
// Add alerts from lat/lon https://api.weather.gov/alerts?active=true&point=41.85,-70.65

export interface ForecastPropertiesPeriod {
    number: number;                   // 1, 2 ...
    name: string;                     // "Overnight", "Friday", "Friday Night", ...
    startTime: string;                // "2021-12-17T06:00:00-05:00",
    endTime: string;                  // "2021-12-17T18:00:00-05:00",
    isDaytime: boolean;               // true - used to lookup the day/night icon
    temperature: number;              // 56,
    temperatureUnit: string;          // "F",
    temperatureTrend: string;         // "falling",
    windSpeed: string;                // "9 to 15 mph",
    windDirection: string;            // "W",
    icon: string;                     // "https://api.weather.gov/icons/land/day/few?size=medium",
    shortForecast: string;            // "Sunny",
    detailedForecast: string;         // "Sunny. High near 56, with temperatures falling to around 47 in the afternoon. West wind 9 to 15 mph, with gusts as high as 28 mph."
}

export interface ForecastProperties {
    updated: string;                  // 2021-12-17T08:54:44+00:00
    periods: Array<ForecastPropertiesPeriod>;
}

export interface Forecast {
    properties: ForecastProperties;
}

export interface AlertFeaturesPropertiesParameters {
    NWSheadline: string;                             // This is the alert summary
}

export interface AlertFeaturesProperties {
    messageType: string;                             // Alert, Update, Cancel
    status: string;                                  // "Actual" is all we care about
    severity: string;                                // Extreme, Severe, Moderate, Minor, Unknown
    event: string;                                   // "Winter Storm Warning",
    parameters: AlertFeaturesPropertiesParameters
    headline: string;                                // This is the alert summary
}

export interface AlertFeatures {
    properties: AlertFeaturesProperties; 
}

export interface Alerts {
    features: Array<AlertFeatures>;
}

export interface Summary {
    forecast: Forecast | null;
    alerts: Alerts | null;
}

export class ForecastData {

    private logger: LoggerInterface;
    private cache: KacheInterface;

    constructor(logger: LoggerInterface, cache: KacheInterface) {
        this.logger = logger;
        this.cache = cache;
    } 
    
    private async getSomeData(url: string, userAgent: string) : Promise<AxiosResponse<any> | null> {
        let response: AxiosResponse | null = null;

        const options: AxiosRequestConfig = {
            headers: {
                "Content-Encoding": "gzip",
                "User-Agent": userAgent, 
                "Feature-Flags": ""
            },
            timeout: 5000
        };

        const startTime = new Date();
        await axios.get(url, options)
            .then((res: AxiosResponse) => {
                if (typeof process.env.TRACK_GET_TIMES !== "undefined" ) {
                    this.logger.info(`ForecastData: GET TIME: ${new Date().getTime() - startTime.getTime()}ms`);
                }

                response = res;
            })
            .catch((error) => {
                this.logger.warn(`ForecastData: GET URL: ${url}, ${error}`);
                response = null;
            }); 

        return response;
    }

    /**
     * First get the station, stationX and stationY from the lat and lon
     * Next fetch the forecast data from api.weather.gov
     * @param lat - Forecast lattitude
     * @param lon - Forecast longitude
     * @param userAgent - identifier for the REST call to NWS
     * @returns Forecast structure or null
     */
    public async getForecastData(lat: string, lon: string, userAgent: string): Promise<Summary | null> {
        try {
            const summary: Summary = {forecast: null, alerts: null};

            let response: AxiosResponse<any> | null = null;

            // Step 1 - lookup the grid
            const gridURL = `https://api.weather.gov/points/${lat},${lon}`;
            this.logger.verbose(`ForecastData: Grid URL: ${gridURL}`);

            response = await this.getSomeData(gridURL, userAgent);

            if (response?.data?.properties?.forecast === undefined) {
                this.logger.warn("ForecastData: Missing response.data.properties.forecast from grid GET call");
                return null;
            }  

            const forecastUrl = response?.data?.properties?.forecast;    

            // Step 2 - Use the grid values to lookup the forecast
            this.logger.verbose(`ForecastData: URL: ${forecastUrl}`);
            response = await this.getSomeData(forecastUrl, userAgent);
            
            if (response?.data?.properties?.periods[0]?.number  === undefined) {
                this.logger.warn("ForecastData: Missing response.data.properties.periods[0].number values");
                return null;
            }
            this.logger.verbose(`ForecastData: data generated at: ${response.data.properties.generatedAt}`);
            
            summary.forecast = response.data;

            // Step 3 - Look up the active alerts
            const alertsURL = `https://api.weather.gov/alerts/active?point=${lat},${lon}`; 
            this.logger.verbose(`ForecastData: Alerts URL: ${alertsURL}`);

            response = await this.getSomeData(alertsURL, userAgent);

            if (response?.data?.features === undefined) {
                this.logger.warn("ForecastData: Missing response.data.features from alert call");
                return null;
            }

            summary.alerts = response.data;

            return summary;
        }  catch(e) {
            if (e instanceof Error) {
                this.logger.error(`ForecastData: Error getting data: ${e.message}`);
                this.logger.error(`${e.stack}`);
            } else {
                this.logger.error(`ForecastData: Error getting data: ${e}`);
            }
            return null;
        }
    }

    private promiseTimeout(delayms: number) {
        return new Promise(function (resolve /*, reject */) {
            setTimeout(resolve, delayms);
        });
    }
}