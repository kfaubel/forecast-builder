/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { LoggerInterface } from "./Logger";
import { KacheInterface } from "./Kache";
import { Readable, Writable } from "stream";
import * as pure from "pureimage";

interface Base64IconStr {
    dataStr: string;  // This is the base64 encoded PNG file contents
}

interface iconInterface {
    width: number;
    height: number;
    data: ArrayBuffer;
}
/**
 * ForecastIcons - This class is used to fetch and cache the icons used in the forecast
 */
export class ForecastIcons {

    private logger: LoggerInterface;
    private cache: KacheInterface;
    private userAgent: string;
    //private iconHost: string = "https://api.weather.gov";

    constructor(logger: LoggerInterface, cache: KacheInterface, userAgent: string) {
        this.logger = logger;
        this.cache = cache;
        this.userAgent = userAgent;
    } 
    
    /**
     * getIcon - Get the icon for the named icon 
     *   First, check the cache for the icon
     *   If not in the cache, fetch the icon using the iconHost (e.g.: api.weather.gov)
     * @param icon (e.g.: "/icons/land/night/sct?size=150")
     * @returns iconInterface | null
     */
    public async getIcon(iconUrl: string) : Promise<iconInterface | null> {
        let picture: iconInterface | null = null;
        this.logger.verbose(`ForecastIcons: Call to get the icon: ${iconUrl}.  Check cache first`);

        const base64IconStr: Base64IconStr = this.cache.get(iconUrl) as Base64IconStr;

        if (base64IconStr !== null) {
            
            const dataStream = new Readable({
                read() {
                    const imageData = Buffer.from(base64IconStr.dataStr, "base64"); //.toString("binary");
                    this.push(imageData);
                    this.push(null);
                }
            });
        
            picture = await pure.decodePNGFromStream(dataStream);
            
        } else {
            const options: AxiosRequestConfig = {
                responseType: "stream",
                headers: {
                    "Content-Encoding": "gzip",
                    "User-Agent": this.userAgent
                },
                timeout: 20000
            };
            
            const startTime = new Date();
            this.logger.verbose(`ForecastIcons: Not in cache. GET: ${iconUrl}`);
            await axios.get(iconUrl, options)
                .then(async (res: AxiosResponse) => {
                    if (typeof process.env.TRACK_GET_TIMES !== "undefined" ) {
                        this.logger.info(`ForecastIcons: icon GET TIME: ${new Date().getTime() - startTime.getTime()}ms`);
                    }
                    picture = await pure.decodePNGFromStream(res.data);
                })
                .catch((error: any) => {
                    this.logger.warn(`ForecastIcons: No Icon: Error: ${error.stack}`);
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

                const cachePicture: Base64IconStr = {dataStr: base64Data};

                const expireMs: number = new Date().getTime() + 10 * 365 * 24 * 60 * 60 * 1000; // 10 years
                this.cache.set(iconUrl, cachePicture, expireMs);
            }
        }

        return picture;
    }
}