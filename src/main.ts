import { animationFrameScheduler, combineLatest, interval } from 'rxjs';
import { filter, map, tap } from 'rxjs/operators';
import { handRecognizer, ModelParams } from './input';

const video = document.getElementById('camera') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const context = canvas.getContext('2d');

const modelParams: ModelParams = {
  flipHorizontal: true, // flip e.g for video
  maxNumBoxes: 20, // maximum number of boxes to detect
  iouThreshold: 0.5, // ioU threshold for non-max suppression
  scoreThreshold: 0.6, // confidence threshold for predictions.
};

const timer$ = interval(0, animationFrameScheduler);
const hands$ = handRecognizer(modelParams, canvas, context, video);

type Spaceship = {
  mode: 'attack' | 'charge',
  center: [number, number],
};
type GameState = {
  spaceship: Spaceship,
  fps: number,
};
const spaceship$ = hands$.pipe(
  map(hands => hands[0]),
  filter(hand => !!hand),
  map((hand) : Spaceship => ({
    mode: hand.mode === 'close' ? 'attack' : 'charge',
    center: hand.center,
  })),
);
const clearCanvas = () => context.clearRect(0, 0, canvas.width, canvas.height);
const drawSpaceship = ({ spaceship }: GameState) => {
  const [x] = spaceship.center;
  const y = canvas.height - 150;
  const width = 50;
  const height = 50;
  context.beginPath();
  context.moveTo(x - width / 2, y + height / 2);
  context.lineTo(x + width / 2, y + height / 2);
  context.lineTo(x, y - height / 2);
  context.closePath();
  context.lineWidth = 2;
  context.strokeStyle = '#0000FF';
  context.stroke();
};

const game$ = combineLatest([
  timer$,
  spaceship$,
]).pipe(
  map(([time, spaceship]): GameState => ({
    spaceship,
    fps: 1000/time,
  })),
  tap(clearCanvas),
  tap(drawSpaceship),
);

game$.subscribe();
