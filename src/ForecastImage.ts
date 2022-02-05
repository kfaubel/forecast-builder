/* eslint-disable indent */
/* eslint-disable @typescript-eslint/no-unused-vars */
import axios, { AxiosResponse, AxiosError } from "axios"; 
import path from "path";
import { Readable, Writable } from "stream";
import jpeg from "jpeg-js";
import * as pure from "pureimage";
import dateFormat from "dateformat"; // https://www.npmjs.com/package/dateformat
import { ForecastData, Summary } from "./ForecastData";
import { LoggerInterface } from "./Logger";
import { KacheInterface} from "./Kache";
import { ImageWriterInterface } from "./SimpleImageWriter";

export interface ImageResult {
    imageType: string;
    imageData: jpeg.BufferRet | null;
}

export class ForecastImage {
    private forecastData: ForecastData;
    private cache: KacheInterface;
    private logger: LoggerInterface;
    private writer: ImageWriterInterface;

    constructor(logger: LoggerInterface, cache: KacheInterface, writer: ImageWriterInterface) {
        this.logger = logger;
        this.cache = cache;
        this.writer = writer;
        this.forecastData = new ForecastData(this.logger, this.cache);
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

    public async getImage(lat: string, lon: string, location: string, userAgent: string): Promise<ImageResult | null> {
        this.logger.verbose(`ForecastImage: request for ${location}`);

        const title = `Forecast for ${location}`;

        const summaryJson: Summary | null = await  this.forecastData.getForecastData(lat, lon, userAgent);

        if (summaryJson === null || summaryJson.forecast === null) {
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
        const iconHeight                       = 200;  // 
        const iconX                            = 75;   // Posiiton of the icon within the column1
        const iconY                            = 180;  // Position of the icon within the row
        const alertY                           = 900;  // First row of the alert
        const alertSpacingY                    = 60;   // Offset for 2nd and 3rd row
                                           
        const backgroundColor                  = "#FFFFFF"; // See myFillRect call below
        const titleColor                       = "rgb(0,     0,   150)";
        const daytimeTempColor                 = "rgb(255,   0,   0)";
        const nighttimeTempColor               = "rgb(0,     0,   255)";
        const weekdayColor                     = "rgb(0 ,    0,   150)";
        const alertColor                       = "rgb(220,   0,   0)";

        const largeFont                        = "80px 'OpenSans-Bold'";      // Title
        const mediumFont                       = "48px 'OpenSans-Regular'";   // weekdays
        const mediumFontBold                   = "48px 'OpenSans-Bold'";      // temps and alerts

        // When used as an npm package, fonts need to be installed in the top level of the main project
        const fntBold     = pure.registerFont(path.join(".", "fonts", "OpenSans-Bold.ttf"),"OpenSans-Bold");
        const fntRegular  = pure.registerFont(path.join(".", "fonts", "OpenSans-Regular.ttf"),"OpenSans-Regular");
        const fntRegular2 = pure.registerFont(path.join(".", "fonts", "alata-regular.ttf"),"alata-regular");
        
        fntBold.loadSync();
        fntRegular.loadSync();
        fntRegular2.loadSync();

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
        this.myFillRect(img, 0, 0, imageWidth, imageHeight, backgroundColor);

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

            //let picture: jpeg.BufferRet | null = null;
            // picture is actually of type Bitmap but that type is internal to pureimage
            let picture = pure.make(150, 150);

            // Now get the icon.  The icon in the period element ends in "=medium".  We want size 150.
            // We could ask for size 200 and the iamge would be clearer but the label (e.g.: "30%"") is too small
            // An iconUrl looks like: https://api.weather.gov/icons/land/day/rain,60?size=150
            const iconUrl = period.icon.replace("=medium", "=150");

            interface Base64ImageStr {
                dataStr: string;  // This is the base64 encoded PNG file contents
            }
            const base64ImageStr: Base64ImageStr = this.cache.get(iconUrl) as Base64ImageStr;

            if (base64ImageStr !== null) {
                
                const dataStream = new Readable({
                    read() {
                        const imageData = Buffer.from(base64ImageStr.dataStr, "base64"); //.toString("binary");
                        this.push(imageData);
                        this.push(null);
                    }
                });
              
                picture = await pure.decodePNGFromStream(dataStream);
                
            } else {
                await axios.get(iconUrl, {responseType: "stream"})
                    .then(async (res: AxiosResponse) => {
                        picture = await pure.decodePNGFromStream(res.data);
                    })
                    .catch((error) => {
                        this.logger.warn(`ForecastImage: No Icon: Error: ${error}`);
                        picture = null;
                    }); 

                if (picture !== null) {
                    let buffer = Buffer.alloc(0);
                    let base64Data = "";

                    const writeableStream = new Writable({
                        write(chunk, encoding, callback) {
                            buffer = Buffer.concat([buffer, chunk]);
                            callback();
                        },
                        destroy() { 
                            base64Data = buffer.toString("base64");
                        }
                    });

                    await pure.encodePNGToStream(picture, writeableStream);

                    const cachePicture: Base64ImageStr = {dataStr: base64Data};

                    const expireMs: number = new Date().getTime() + 10 * 365 * 24 * 60 * 60 * 1000; // 10 years
                    this.cache.set(iconUrl, cachePicture, expireMs);
                }
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

        if (summaryJson?.alerts?.features[0]?.properties?.parameters?.NWSheadline) {
            alertStr = "Active alert: " + summaryJson.alerts.features[0].properties.parameters.NWSheadline;
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