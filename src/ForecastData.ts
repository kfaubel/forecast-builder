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
            const summary: Summary = {forecast: null, alerts: null};
            // Step 1 - lookup the grid
            const gridURL = `https://api.weather.gov/points/${lat},${lon}`;
            this.logger.verbose(`Grid lookup: ${gridURL}`);

            let response: AxiosResponse | null = null;
            let attempts = 1;

            while (response === null && attempts <= 2) {
                try {
                    response = await axios.get(gridURL, 
                        {
                            headers: {
                                "Content-Encoding": "gzip", 
                                "User-Agent": userAgent
                            }, 
                            timeout: 2000
                        }
                    );
                } catch (e) {
                    // For more, see: https://github.com/axios/axios#handling-errors
                    this.logger.error(`ForecastData: grid(${attempts}): ${e}`);
                } 

                if (response !== null && attempts !== 1) {
                    this.logger.info("Retry of grid GET worked!!!");
                }
                attempts++;
            }

            if (response === null) {
                this.logger.error("No grid data");
                return null;
            }
                
            //this.logger.verbose(JSON.stringify(response.data, null, 4));
            const gridJson: Grid = response.data;

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
             

            // Step 2 - Use the grid values to lookup the forecast
            //const forecastURL = `https://api.weather.gov/gridpoints/${gridJson.properties.gridId}/${gridJson.properties.gridX},${gridJson.properties.gridY}/forecast`;
            
            this.logger.verbose(`Forecast URL: ${gridJson.properties.forecast}`);

            response = null;
            attempts = 1;

            while (response === null && attempts <= 2) {
                try {
                    response = await axios.get(gridJson.properties.forecast, 
                        {
                            headers: {
                                "Content-Encoding": "gzip", 
                                "User-Agent": userAgent
                            }, 
                            timeout: 2000
                        }
                    );
                } catch (e) {
                    // For more, see: https://github.com/axios/axios#handling-errors
                    this.logger.error(`ForecastData: forecast(${attempts}): ${e}`);
                } 

                if (response !== null && attempts !== 1) {
                    this.logger.info("Retry of forecast GET worked!!!");
                }
                attempts++;
            }

            if (response === null) {
                this.logger.error("No forecast data");
                return null;
            }
            
            const forecastJson: Forecast = response.data;

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
           
            summary.forecast = forecastJson;

            // Step 3 - Look up the active alerts
            const alertsURL = `https://api.weather.gov/alerts/active?point=${lat},${lon}`; 
            this.logger.verbose(`Alerts URL: ${alertsURL}`);

            response = null;
            attempts = 1;

            while (response === null && attempts <= 2) {
                try {
                    response = await axios.get(alertsURL, 
                        {
                            headers: {
                                "Content-Encoding": "gzip", 
                                "User-Agent": userAgent
                            }, 
                            timeout: 2000
                        }
                    );
                } catch (e) {
                    // For more, see: https://github.com/axios/axios#handling-errors
                    this.logger.error(`ForecastData: alert(${attempts}): ${e}`);
                }
                
                if (response !== null && attempts !== 1) {
                    this.logger.info("Retry of alert GET worked!!!");
                }
                attempts++;
            }

            if (response === null) {
                this.logger.error("No alert data");
                return null;
            }

            const alertsJson: Alerts = response.data;
 
            
            if (alertsJson !== undefined) {
                if (typeof alertsJson.features === "undefined") {
                    this.logger.error("Missing alert values");
                    this.logger.verbose(JSON.stringify(alertsJson, null, 4));
                    return null;
                }
            } else {
                this.logger.error("Missing data from alert call");
                return null;
            } 

            summary.alerts = alertsJson;

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
}