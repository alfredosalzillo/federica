import {
  animationFrameScheduler,
  combineLatest,
  defer,
  from,
  interval,
  observable,
  Observable,
  Scheduler,
  timer,
  zip
} from "rxjs";
import {filter, mergeMap, tap} from "rxjs/operators";
import * as handTrack from 'handtrackjs';

type Prediction = {
  bbox: [number, number, number, number],
  class: number,
  score: number,
};

type HandMode = 'open' | 'close'
type Hand = {
  mode: HandMode,
  center: [number, number],
  dimension: [number, number],
};

const calculateHandMode = (
  width: number,
  height: number,
): HandMode => height / width > 1 ? 'open' : 'close';

const toHand = ({
  bbox: [x, y, width, height],
}: Prediction): Hand => ({
  mode: calculateHandMode(width, height),
  center: [x, y],
  dimension: [width, height],
});

const takeTheGoodOne = (predictions: Prediction[]): Prediction => predictions[0];

const video = document.getElementById("camera");
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d");

const modelParams = {
  flipHorizontal: true,   // flip e.g for video
  maxNumBoxes: 20,        // maximum number of boxes to detect
  iouThreshold: 0.5,      // ioU threshold for non-max suppression
  scoreThreshold: 0.6,    // confidence threshold for predictions.
};

const detect = (model, next) => model.detect(video)
  .then(next)
  .then(() => requestAnimationFrame(() => detect(model, next)));

const model$ = defer<Promise<any>>(() => handTrack.load(modelParams));
const status$ = defer(() => handTrack.startVideo(video));
const predictions$: Observable<Prediction[]> = zip(
  status$,
  model$,
).pipe(
  tap(([status]) => console.log("video started", status)),
  filter(([status]) => !!status),
  mergeMap(([_, model]) => Observable.create(subscriber => detect(model, subscriber.next.bind(subscriber)))),
) as Observable<Prediction[]>;

const renderPredictions = ([model, predictions]) => model.renderPredictions(predictions, canvas, context, video);

combineLatest(
  model$,
  predictions$,
).pipe(
  tap(renderPredictions),
  // tap(([_, predictions]) => predictions.map(toHand).forEach(console.log)),
).subscribe();
