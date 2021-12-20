/* eslint-disable @typescript-eslint/no-unused-vars */
import axios from "axios"; 
import path from "path";
import { Stream } from "stream";
import jpeg from "jpeg-js";
import * as pure from "pureimage";
import dateFormat from "dateformat"; // https://www.npmjs.com/package/dateformat
import { ForecastData, Summary, Forecast, ForecastProperties, ForecastPropertiesPeriod, Alerts } from "./ForecastData";
import { LoggerInterface } from "./Logger";
import { KacheInterface} from "./Kache";

export interface ImageResult {
    imageType: string;
    imageData: jpeg.BufferRet | null;
}

interface AxiosResponse {
    data: Stream;
    status: number;
    statusText: string;
}

export class ForecastImage {
    private forecastData: ForecastData;
    private cache: KacheInterface;
    private logger: LoggerInterface;

    constructor(logger: LoggerInterface, cache: KacheInterface) {
        this.logger = logger;
        this.cache = cache;
        this.forecastData = new ForecastData(this.logger, this.cache);
    }

    // This optimized fillRect was derived from the pureimage source code: https://github.com/joshmarinacci/node-pureimage/tree/master/src
    // To fill a 1920x1080 image on a core i5, this saves about 1.5 seconds
    // x, y       - position of the rect
    // w, h       - size of the rect
    // iw         - width of the image being written into, needed to calculate index into the buffer
    // r, g, b, a - values to draw
    private myFillRect(image: Buffer, x: number, y: number, w: number, h: number, iw: number, r: number, g: number, b: number, a: number) {
        for(let i = y; i < y + h; i++) {                
            for(let j = x; j < x + w; j++) {   
                const index = (i * iw + j) * 4;     
                image[index + 0] = r; 
                image[index + 1] = g; 
                image[index + 2] = b; 
                image[index + 3] = a; 
            }
        }
    }

    public async getImage(lat: string, lon: string, location: string, userAgent: string): Promise<ImageResult | null> {
        this.logger.info(`ForecastImage: request for ${location}`);

        const title = `Forecast for ${location}`;

        const summaryJson: Summary | null = await  this.forecastData.getForecastData(lat, lon, userAgent);

        if (summaryJson === null) {
            this.logger.warn("ForecastImage: Failed to get data, no image available.");
            return null;
        }

        if (summaryJson.forecast === null) {
            this.logger.warn("ForecastImage: Failed to get forecast data, no image available.");
            return null;
        }

        const imageHeight                      = 1080; 
        const imageWidth                       = 1920;      

        const titleOffsetY                     = 80;                                      // down from the top of the image
        const originX                          = 100;  // Starting point for drawing the table X
        const originY                          = 100;  // Starting point for drawing the table Y
        const columnWidth                      = 340;  // Columns are 350 pixels wide
        const rowHeight                        = 320;  // Everything in the second row is 320 below the first
        const weekdayY                         = 80;   // Draw the weekend 50 pixels below the start of the first row
        const tempY                            = 150;  // Draw the temp value 180 pixels below the start of the first row
        const iconWidth                        = 200;  // Size of the icon
        const iconHeight                       = 200;  // 
        const iconX                            = 75;   // Posiiton of the icon within the column1
        const iconY                            = 180;  // Position of the icon within the row
        const alertY                           = 900;  // First row of the alert
        const alertSpacingY                    = 60;   // Offset for 2nd and 3rd row
                                           
        const backgroundColor                  = "rgb(255, 255,   255)";
        const titleColor                       = "rgb(0,     0,   150)";
        const daytimeTempColor                 = "rgb(255,   0,   0)";
        const nighttimeTempColor               = "rgb(0,     0,   255)";
        const weekdayColor                     = "rgb(0 ,    0,   150)";
        const alertColor                       = "rgb(220,   0,   0)";

        const largeFont                        = "80px 'OpenSans-Bold'";      // Title
        const mediumFont                       = "48px 'OpenSans-Regular'";   // weekdays
        const mediumFontBold                   = "48px 'OpenSans-Bold'";      // temps and alerts
        const smallFont                        = "24px 'OpenSans-Bold'";   

        // When used as an npm package, fonts need to be installed in the top level of the main project
        const fntBold     = pure.registerFont(path.join(".", "fonts", "OpenSans-Bold.ttf"),"OpenSans-Bold");
        const fntRegular  = pure.registerFont(path.join(".", "fonts", "OpenSans-Regular.ttf"),"OpenSans-Regular");
        const fntRegular2 = pure.registerFont(path.join(".", "fonts", "alata-regular.ttf"),"alata-regular");
        
        fntBold.loadSync();
        fntRegular.loadSync();
        fntRegular2.loadSync();

        const regularStroke = 2;

        const img = pure.make(imageWidth, imageHeight);
        const ctx = img.getContext("2d");

        // Extend ctx with function to draw centered text
        ctx.centerText = function(text: string, x: number, y: number): void {
            const width = this.measureText(text).width;
            this.fillText(text, x - width/2, y);
        };

        // Extend ctx with function to draw line under text
        ctx.centerUnderline = function(text: string, x: number, y: number, color: string): void {
            const width = this.measureText(text).width;
            const oldStrokeStyle = this.strokeStyle;
            const oldLineWidth = this.lineWidth;
            this.strokeStyle = color;
            this.lineWidth = 2;
            this.moveTo(x - width/2, y + 5);
            this.lineTo(x + width/2, y + 5);
            this.stroke();
            this.strokeStyle = oldStrokeStyle;
            this.lineWidth = oldLineWidth;
        };

        // Fill the bitmap
        ctx.fillStyle = backgroundColor;
        //ctx.fillRect(0, 0, imageWidth, imageHeight);
        this.myFillRect(img.data, 0, 0, imageWidth, imageHeight, imageWidth, 0xE0, 0xE0, 0xFF, 0);

        // Draw the title
        ctx.fillStyle = titleColor;
        ctx.font = largeFont;
        ctx.centerText(title, imageWidth/2, titleOffsetY);
        
        const labelDate = new Date(summaryJson.forecast.properties.periods[0].startTime);

        // Draw the weekday labels across each column
        for (let i = 0; i < 5; i++) {
            ctx.font = mediumFontBold;
            ctx.fillStyle = weekdayColor;
            ctx.centerText(dateFormat(labelDate, "dddd"), originX + (columnWidth * i) + columnWidth/2, originY + weekdayY);
            ctx.centerUnderline(dateFormat(labelDate, "dddd"), originX + (columnWidth * i) + columnWidth/2, originY + weekdayY, weekdayColor);

            // Advance for the next iteration
            labelDate.setDate(labelDate.getDate() + 1);
        }

        let row = 0; // row 0 is daytime, 1 is night
        let col = 0; // col 0 is the first day, ...

        // The first element will be the overnight period between midnight and about 6AM
        if (summaryJson.forecast.properties.periods[0].isDaytime === false) {
            row = 1; // Skip the daytime part since it has passed.
        }

        for (const period of summaryJson.forecast.properties.periods) {
            ctx.font = mediumFontBold;

            // Draw the temp in red for daytime high and blue for overnight low
            ctx.fillStyle = period.isDaytime === true ? daytimeTempColor : nighttimeTempColor;
            ctx.centerText(`${period.temperature} ${period.temperatureUnit}`, originX + (columnWidth * col) + columnWidth/2, originY + (rowHeight * row) + tempY);

            let picture: jpeg.BufferRet | null = null;

            // Now get the icon.  The icon in the period element ends in "=medium".  We want size 150.
            // We could ask for size 200 and the iamge would be clearer but the label (e.g.: "30%"") is too small
            const iconUrl = period.icon.replace("=medium", "=150");

            try {
                const response: AxiosResponse = await axios.get(iconUrl, {responseType: "stream"} );
                picture = await pure.decodePNGFromStream(response.data);
            } catch (e) {
                picture = null;
            }

            if (picture !== null) {
                const scaledWidth = (iconHeight * picture.width) / picture.height;
                ctx.drawImage(picture,
                    0, 0, picture.width, picture.height,             // source dimensions
                    originX + iconX + (columnWidth * col), originY + iconY + (rowHeight * row), scaledWidth, iconHeight  // destination dimensions
                );
            } 

            row++;
            if (row > 1) {
                row = 0;
                col++;
            }

            if (col > 4)
                break;
        }

        ctx.font = mediumFont;
        ctx.fillStyle = alertColor;
        let alertStr = "No active alerts";

        if (summaryJson.alerts !== null && 
            typeof summaryJson.alerts.features !== "undefined" &&
            typeof summaryJson.alerts.features[0] !== "undefined" &&
            typeof summaryJson.alerts.features[0].properties !== "undefined" &&
            typeof summaryJson.alerts.features[0].properties.parameters !== "undefined" &&
            typeof summaryJson.alerts.features[0].properties.parameters.NWSheadline !== "undefined") {
            alertStr = "Active alert: " + summaryJson.alerts.features[0].properties.headline;
        }

        const alertLines: string[] = this.splitLine(alertStr, ctx, imageWidth - 200, 3);       

        for (let alertLine = 0; alertLine < alertLines.length; alertLine++) {            
            ctx.fillText(alertLines[alertLine], originX, alertY + (alertLine * alertSpacingY));
        } 

        const jpegImg: jpeg.BufferRet = jpeg.encode(img, 80);
        
        return {
            imageData: jpegImg,
            imageType: "jpg"
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private splitLine(inStr: string, ctx:any, maxPixelLength: number, maxLines: number) {
        const list: string[] = [];

        if (maxLines < 1 || maxLines > 10) {
            this.logger.error(`splitLine: maxLines too large (${maxLines})`);
            return list;
        }
        
        while (inStr.length > 0) {
            let breakIndex: number;
            if (ctx.measureText(inStr).width <= maxPixelLength) {
                list.push(inStr);
                return list;
            }

            breakIndex = inStr.length - 1;
            let activeLine = "";
            while (breakIndex > 0) {
                if (inStr.charAt(breakIndex) === " ") {
                    activeLine = inStr.substring(0, breakIndex);
                    if (ctx.measureText(activeLine).width <= maxPixelLength) {
                        break;
                    } 
                }
                breakIndex--;
            } 
            
            list.push(inStr.substring(0, breakIndex));
            inStr = inStr.substring(breakIndex + 1);

            if (list.length >= maxLines)
                break;
        }
        return list;
    }
}