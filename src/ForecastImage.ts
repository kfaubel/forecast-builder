/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable indent */
/* eslint-disable @typescript-eslint/no-unused-vars */
import axios, { AxiosResponse, AxiosError, AxiosRequestConfig } from "axios"; 
import path from "path";
import { Readable, Writable } from "stream";
import jpeg from "jpeg-js";
import * as pure from "pureimage";
import moment from "moment-timezone";  // https://momentjs.com/timezone/docs/ &  https://momentjs.com/docs/
import { ForecastData, Summary } from "./ForecastData";
import { ForecastIcons } from "./ForecastIcons";
import { LoggerInterface } from "./Logger";
import { KacheInterface} from "./Kache";
import { ImageWriterInterface } from "./SimpleImageWriter";

export interface ImageResult {
    imageType: string;
    imageData: jpeg.BufferRet | null;
}


export class ForecastImage {
    private forecastData: ForecastData;
    private forecastIcons: ForecastIcons;
    private cache: KacheInterface;
    private logger: LoggerInterface;
    private writer: ImageWriterInterface;
    private userAgent: string;
    
    private imageHeight: number;       
    private imageWidth: number;      

    private titleOffsetY: number;                                      // down from the top of the image
    private originX: number;             // Starting point for drawing the table X
    private originY: number;             // Starting point for drawing the table Y
    private columnWidth: number;         // Columns are 350 pixels wide
    private rowHeight: number;           // Everything in the second row is 320 below the first
    private weekdayY: number;            // Draw the weekend 50 pixels below the start of the first row
    private tempY: number;               // Draw the temp value 180 pixels below the start of the first row
    private iconHeight: number;          // 
    private iconX: number;               // Posiiton of the icon within the column1
    private iconY: number;               // Position of the icon within the row
    private alertLabelY: number;         // Alert Label
    private alertY: number;              // First row of the alert
    private alertSpacingY: number;       // Offset for 2nd and 3rd row
    private alertWidth: number;          // Width of the alert text
    private forecastSpacingY: number;    // Offset for 2nd and 3rd row
    private forecastWidth: number;       // Width of the forecast text
                                       
    private backgroundColor: string;     // See myFillRect call below
    private titleColor: string;
    private daytimeTempColor: string;
    private nighttimeTempColor: string;
    private weekdayColor: string;
    private alertColor: string;

    private largeFont: string;           // Title
    private mediumFont: string;          // weekdays
    private mediumFontBold: string;      // temps and alerts

    constructor(logger: LoggerInterface, cache: KacheInterface, writer: ImageWriterInterface, userAgent: string) {
        this.logger = logger;
        this.cache = cache;
        this.writer = writer;
        this.forecastData = new ForecastData(this.logger, this.cache);
        this.forecastIcons = new ForecastIcons(this.logger, this.cache, userAgent);
        this.userAgent = userAgent;

        this.imageHeight                      = 1080; 
        this.imageWidth                       = 1920;      

        this.titleOffsetY                     = 80;                                      // down from the top of the image
        this.originX                          = 100;  // Starting point for drawing the table X (offset from lefthand side)
        this.originY                          = 100;  // Starting point for drawing the table Y (offset from top of image)
        this.columnWidth                      = 400;  // Columns are 350 pixels wide
        this.rowHeight                        = 320;  // Everything in the second row is 320 below the first
        this.weekdayY                         = 80;   // Draw the weekend 50 pixels below the start of the first row
        this.tempY                            = 150;  // Draw the temp value 180 pixels below the start of the first row
        this.iconHeight                       = 400;  // 
        this.iconX                            = 75;   // Posiiton of the icon within the column1
        this.iconY                            = 170;  // Position of the icon within the row
        this.alertLabelY                      = 800;  // First row of the alert label
        this.alertY                           = 870;  // First row of the alert
        this.alertSpacingY                    = 60;   // Offset for 2nd and 3rd row
        this.alertWidth                       = 1400;  // Width of the alert text
        this.forecastSpacingY                 = 60;   // Offset for 2nd and 3rd row
        this.forecastWidth                    = 1000;  // Width of the forecast text
                                        
        this.backgroundColor                  = "#FFFFFF"; // See myFillRect call below
        this.titleColor                       = "rgb(0,     0,   150)";
        this.daytimeTempColor                 = "rgb(255,   0,   0)";
        this.nighttimeTempColor               = "rgb(0,     0,   255)";
        this.weekdayColor                     = "rgb(0 ,    0,   150)";
        this.alertColor                       = "rgb(220,   0,   0)";

        this.largeFont                        = "80px 'OpenSans-Bold'";      // Title
        this.mediumFont                       = "50px 'OpenSans-Regular'";   // weekdays
        this.mediumFontBold                   = "60px 'OpenSans-Bold'";      // temps and alerts
    }

    /**
     * Optimized fill routine for pureimage
     * - See https://github.com/joshmarinacci/node-pureimage/tree/master/src
     * - To fill a 1920x1080 image on a core i5, this saves about 1.5 seconds
     * @param img it has 3 properties height, width and data
     * @param x X position of the rect
     * @param y Y position of the rect
     * @param w Width of rect
     * @param h Height of rect
     * @param rgb Fill color in "#112233" format
     */
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     private myFillRect(img: any, x: number, y: number, w: number, h: number, rgb: string) {
        const colorValue = parseInt(rgb.substring(1), 16);

        // The shift operator forces js to perform the internal ToUint32 (see ecmascript spec 9.6)
        const r = (colorValue >>> 16) & 0xFF;
        const g = (colorValue >>> 8)  & 0xFF;  
        const b = (colorValue)        & 0xFF;
        const a = 0xFF;

        for(let i = y; i < y + h; i++) {                
            for(let j = x; j < x + w; j++) {   
                const index = (i * img.width + j) * 4;   
                
                img.data[index + 0] = r;
                img.data[index + 1] = g;     
                img.data[index + 2] = b;     
                img.data[index + 3] = a; 
            }
        }
    }

    /**
     * 
     * @param ctx 
     * @param currentPeriodName 
     * @param currentPeriodTempLabel 
     * @param currentPeriodIconURL 
     * @param x 
     * @param y 
     * @param iconSize 
     */
    private async drawForecast(ctx: any, currentPeriodName: string, currentPeriodTempLabel: string, currentPeriodIconURL:string, x: number, y: number, iconSize: number): Promise<void> {
        ctx.font = this.mediumFontBold;
        ctx.fillStyle = this.weekdayColor;
        const scaledWidth = iconSize;
        const scaledHeight = iconSize;

        // Draw the "Today" or "Tonight" label
        ctx.centerText(currentPeriodName, x + scaledWidth/2, y + this.weekdayY);
        ctx.centerUnderline(currentPeriodName, x + scaledWidth/2, y + this.weekdayY, this.weekdayColor);

        // Draw the current temperature forecast
        ctx.fillStyle = currentPeriodName.includes("Tonight") ? this.nighttimeTempColor : this.daytimeTempColor;
        ctx.centerText(currentPeriodTempLabel, x + scaledWidth/2, y + this.tempY);

        // Draw the current icon
        const iconUrl = currentPeriodIconURL.replace("=medium", "=150");

        const icon = await this.forecastIcons.getIcon(iconUrl);

        if (icon !== null) {            
            this.logger.verbose(`ForecastImage: icon ${icon.width}x${icon.height} scaled to ${scaledWidth}x${scaledHeight}, at ${x}, ${y + scaledWidth}`);
                
            ctx.drawImage(icon,
                0, 0, icon.width, icon.height,             // source dimensions
                x, y + this.iconY, scaledWidth, scaledHeight  // destination dimensions
            );
        } 
    }

    public async getImage(lat: string, lon: string, location: string): Promise<ImageResult | null> {
        this.logger.verbose(`ForecastImage: request for ${location}`);

        const title = `Forecast for ${location}`;

        const summaryJson: Summary | null = await  this.forecastData.getForecastData(lat, lon, this.userAgent);

        if (summaryJson === null || summaryJson.forecast === null) {
            return null;
        }

        // this.logger.verbose(`ForecastImage: ${JSON.stringify(summaryJson.forecast, null, 4)}`);


        // When used as an npm package, fonts need to be installed in the top level of the main project
        const fntBold     = pure.registerFont(path.join(".", "fonts", "OpenSans-Bold.ttf"),"OpenSans-Bold");
        const fntRegular  = pure.registerFont(path.join(".", "fonts", "OpenSans-Regular.ttf"),"OpenSans-Regular");
        const fntRegular2 = pure.registerFont(path.join(".", "fonts", "alata-regular.ttf"),"alata-regular");
        
        fntBold.loadSync();
        fntRegular.loadSync();
        fntRegular2.loadSync();

        const img = pure.make(this.imageWidth, this.imageHeight);
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
        this.myFillRect(img, 0, 0, this.imageWidth, this.imageHeight, this.backgroundColor);

        // Draw the title
        ctx.fillStyle = this.titleColor;
        ctx.font = this.largeFont;
        ctx.centerText(title, this.imageWidth/2, this.titleOffsetY);
        let currentPeriodName: string = "";
        let currentPeriodTemp: number = 0;
        let currentPeriodTempUnit: string = "";
        let currentPeriodIconURL: string = "";
        let tempLabel: string = "";

        currentPeriodName = summaryJson.forecast.properties.periods[0].name;
        currentPeriodTemp = summaryJson.forecast.properties.periods[0].temperature;
        currentPeriodTempUnit = summaryJson.forecast.properties.periods[0].temperatureUnit;
        currentPeriodIconURL = summaryJson.forecast.properties.periods[0].icon;
        tempLabel = `${currentPeriodTemp} ${currentPeriodTempUnit}`;

        await this.drawForecast(ctx, currentPeriodName, tempLabel, currentPeriodIconURL, this.originX, this.originY, 425);

        currentPeriodName = summaryJson.forecast.properties.periods[1].name;
        currentPeriodTemp = summaryJson.forecast.properties.periods[1].temperature;
        currentPeriodTempUnit = summaryJson.forecast.properties.periods[1].temperatureUnit;
        currentPeriodIconURL = summaryJson.forecast.properties.periods[1].icon;
        tempLabel = `${currentPeriodTemp} ${currentPeriodTempUnit}`;

        await this.drawForecast(ctx, currentPeriodName, tempLabel, currentPeriodIconURL, this.originX + 1400, this.originY, 250);
        
        currentPeriodName = summaryJson.forecast.properties.periods[2].name;
        currentPeriodTemp = summaryJson.forecast.properties.periods[2].temperature;
        currentPeriodTempUnit = summaryJson.forecast.properties.periods[2].temperatureUnit;
        currentPeriodIconURL = summaryJson.forecast.properties.periods[2].icon;
        tempLabel = `${currentPeriodTemp} ${currentPeriodTempUnit}`;

        await this.drawForecast(ctx, currentPeriodName, tempLabel, currentPeriodIconURL, this.originX + 1400, this.originY + 480, 250);

        // Draw the detailed forecast
        //const currentPeriodDetailedForecast = summaryJson.forecast.properties.periods[0].detailedForecast;
        const currentPeriodDetailedForecast = summaryJson.forecast.properties.periods[0].shortForecast;
        const forecastLines: string[] = this.splitLine(currentPeriodDetailedForecast, ctx, this.forecastWidth, 6);

        ctx.fillStyle = this.weekdayColor;
        ctx.font = this.mediumFont;
        for (let forecaastLine = 0; forecaastLine < forecastLines.length; forecaastLine++) {            
            ctx.fillText(forecastLines[forecaastLine], this.originX + 450, 360 + (forecaastLine * this.forecastSpacingY));
        } 

        // Draw the active alerts
        
        ctx.fillStyle = this.alertColor;
        ctx.strokeStyle = this.alertColor;

        // Draw the alert label
        ctx.font = this.mediumFont;
        ctx.fillText("Active Alerts", this.originX, this.alertLabelY);
        const width = ctx.measureText("Active Alerts").width;
        ctx.lineWidth = 2;
        ctx.moveTo(this.originX, this.alertLabelY + 5);
        ctx.lineTo(this.originX + width, this.alertLabelY + 5);
        ctx.stroke();

        // Draw the alert text
        let alertStr = "No alerts";
        //let alertStr = "The weather at this location is currently calm and there are no active alerts.  This could change at any time, so please check back later.";

        if (summaryJson?.alerts?.features[0]?.properties?.parameters?.NWSheadline) {
            alertStr = summaryJson.alerts.features[0].properties.parameters.NWSheadline[0]; // NWSheadline is actually an array!  Take the first one.
        }

        const alertLines: string[] = this.splitLine(alertStr, ctx, this.alertWidth, 3);       

        ctx.font = this.mediumFont;
        for (let alertLine = 0; alertLine < alertLines.length; alertLine++) {         
            ctx.fillText(alertLines[alertLine], this.originX, this.alertY + (alertLine * this.alertSpacingY)); 
        } 

        // Convert the image to a jpeg
        const jpegImg: jpeg.BufferRet = jpeg.encode(img, 80);
        
        return {
            imageData: jpegImg,
            imageType: "jpg"
        };
    }

    /**
     * Split a long string into chunks to display on multiple lines
     * @param inStr Input string
     * @param ctx Canvas context used to measure line lenght in pixels
     * @param maxPixelLength Max length of a line in pixels
     * @param maxLines Max lines to return, remainder is discarded
     * @returns A list of strings
     */
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     private splitLine(inStr: string, ctx: any, maxPixelLength: number, maxLines: number): Array<string> {
        const list: string[] = [];

        if (maxLines < 1 || maxLines > 10) {
            this.logger.info(`splitLine: maxLines too large (${maxLines})`);
            maxLines = 4;
        }
        
        while (inStr.length > 0) {
            let breakIndex: number;

            // Will what's left, fit in a line?
            if (ctx.measureText(inStr).width <= maxPixelLength) {
                list.push(inStr);
                return list;
            }

            // Walk back from the end of the input string to find a chuck that will fit on a line.
            breakIndex = inStr.length - 1;
            let activeLine = "";
            while (breakIndex > 0) {
                if (inStr.charAt(breakIndex) === " ") {
                    // We found a break, will the chunk fit
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