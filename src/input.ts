import * as handTrack from 'handtrackjs';
import { combineLatest, defer, Observable, zip } from 'rxjs';
import { filter, map, mergeMap, tap } from 'rxjs/operators';

export type ModelParams = Partial<{
  flipHorizontal: boolean, // flip e.g for video
  maxNumBoxes: number, // maximum number of boxes to detect
  iouThreshold: number, // ioU threshold for non-max suppression
  scoreThreshold: number, // confidence threshold for predictions.
}>;
export type Prediction = {
  bbox: [number, number, number, number];
  class: number;
  score: number;
};
export type HandMode = 'open' | 'close';
export type Hand = {
  mode: HandMode;
  center: [number, number];
  dimension: [number, number];
};

const openCloseRatio = 1.1;
const calculateHandMode = (width: number, height: number): HandMode =>
  height / width > openCloseRatio ? 'open' : 'close';
const toHand = ({ bbox: [x, y, width, height] }: Prediction): Hand => ({
  mode: calculateHandMode(width, height),
  center: [x, y],
  dimension: [width, height],
});

export const handRecognizer = (
  modelParams: ModelParams,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
): Observable<Hand[]> => {
  const detect = (model, next) => model
    .detect(video)
    .then(next)
    .then(() => requestAnimationFrame(() => detect(model, next)));

  const model$ = defer<Promise<any>>(() => handTrack.load(modelParams));
  const status$ = defer(() => handTrack.startVideo(video));
  const predictions$: Observable<Prediction[]> = zip(status$, model$).pipe(
    tap(([status]) => console.log('video started', status)),
    filter(([status]) => !!status),
    mergeMap(
      ([_, model]) =>
        new Observable(subscriber =>
          detect(model, subscriber.next.bind(subscriber)),
        ),
    ),
  ) as Observable<Prediction[]>;

  const renderPredictions = ([model, predictions]) =>
    model.renderPredictions(predictions, canvas, context, video);

  return combineLatest([
    model$,
    predictions$,
  ]).pipe(
    // tap(renderPredictions),
    map(([_, predictions]) => predictions.map(toHand)),
  );
};
