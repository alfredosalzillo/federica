import { tap } from 'rxjs/operators';
import {handRecognizer, ModelParams} from './input';

const video = document.getElementById('camera') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const context = canvas.getContext('2d');

const modelParams: ModelParams = {
  flipHorizontal: true, // flip e.g for video
  maxNumBoxes: 20, // maximum number of boxes to detect
  iouThreshold: 0.5, // ioU threshold for non-max suppression
  scoreThreshold: 0.6, // confidence threshold for predictions.
};

handRecognizer(modelParams, canvas, context, video)
  .pipe(
    tap(console.log),
  )
  .subscribe();
