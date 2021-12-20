import axios, { AxiosResponse } from "axios";
// import moment from "moment-timezone";  // https://momentjs.com/timezone/docs/ &  https://momentjs.com/docs/
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

interface GridProperties {
    gridId: string;    // BOX
    gridX:  string;    // 88
    gridY:  string;    // 55
    forecast: string;  // URL of forecast data
}

interface Grid {
    properties: GridProperties;
}

export class ForecastData {

    private logger: LoggerInterface;
    private cache: KacheInterface;

    constructor(logger: LoggerInterface, cache: KacheInterface) {
        this.logger = logger;
        this.cache = cache;
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
            const headers = {
                "Content-Encoding": "gzip", 
                "User-Agent": userAgent
            };

            const summary: Summary = {forecast: null, alerts: null};
            // Step 1 - lookup the grid
            const gridURL = `https://api.weather.gov/points/${lat},${lon}`;
            this.logger.verbose(`Grid lookup: ${gridURL}`);

            let gridJson: Grid;

            try {
                const response: AxiosResponse = await axios.get(gridURL, {headers: {headers}, timeout: 2000});
                gridJson = response.data;

                // this.logger.verbose("Properties: " + JSON.stringify(gridJson.properties, null, 4));

                if (gridJson !== undefined) {
                    if (typeof gridJson.properties        === "undefined" ||
                        typeof gridJson.properties.gridId === "undefined" ||
                        typeof gridJson.properties.gridX  === "undefined" ||
                        typeof gridJson.properties.gridY  === "undefined") {
                        this.logger.error("Missing grid values");                        
                        return null;
                    }
                } else {
                    this.logger.error("Missing data from grid call");
                    return null;
                } 
                
            } catch(e) {
                this.logger.error(`ForecastData: Error getting grid data: ${e}`);
                return null;
            }

            // Step 2 - Use the grid values to lookup the forecast
            //const forecastURL = `https://api.weather.gov/gridpoints/${gridJson.properties.gridId}/${gridJson.properties.gridX},${gridJson.properties.gridY}/forecast`;
            
            this.logger.verbose(`Forecast URL: ${gridJson.properties.forecast}`);

            let forecastJson: Forecast;
 
            try {
                const response: AxiosResponse = await axios.get(gridJson.properties.forecast, {headers: {headers}, timeout: 2000});
                forecastJson = response.data;

                // this.logger.verbose("Properties: " + JSON.stringify(forecastJson.properties, null, 4));

                if (forecastJson !== undefined) {
                    if (typeof forecastJson.properties                    === "undefined" ||
                        typeof forecastJson.properties.periods            === "undefined" ||
                        typeof forecastJson.properties.periods[0].number  === "undefined") {
                        this.logger.error("Missing forecast values");
                        this.logger.verbose(JSON.stringify(forecastJson, null, 4));
                        return null;
                    }
                } else {
                    this.logger.error("Missing data from forecast call");
                    return null;
                }                 
            } catch(e) {
                this.logger.error(`ForecastData: Error getting forecast data: ${e}`);
                return null;
            }

            summary.forecast = forecastJson;

            // Step 3 - Look up the active alerts
            const alertsURL = `https://api.weather.gov/alerts/active?point=${lat},${lon}`; 
            this.logger.verbose(`Alerts URL: ${alertsURL}`);

            let alertsJson: Alerts;
 
            try {
                const response: AxiosResponse = await axios.get(alertsURL, {headers: {headers}, timeout: 2000});
                alertsJson = response.data;

                // this.logger.verbose("Alerts: " + JSON.stringify(alertsJson, null, 4));

                if (forecastJson !== undefined) {
                    if (typeof forecastJson.properties                    === "undefined" ||
                        typeof forecastJson.properties.periods            === "undefined" ||
                        typeof forecastJson.properties.periods[0].number  === "undefined") {
                        this.logger.error("Missing forecast values");
                        this.logger.verbose(JSON.stringify(forecastJson, null, 4));
                        return null;
                    }
                } else {
                    this.logger.error("Missing data from forecast call");
                    return null;
                } 

                
            } catch(e) {
                this.logger.error(`ForecastData: Error getting forecast data: ${e}`);
                return null;
            }
            summary.alerts = alertsJson;

            return summary;
        }  catch(e) {
            if (e instanceof Error) {
                this.logger.error(`ForecastData: Error getting forecast data: ${e.message}`);
                this.logger.error(`${e.stack}`);
            } else {
                this.logger.error(`ForecastData: Error getting forecast data: ${e}`);
            }
            return null;
        }
    }
}