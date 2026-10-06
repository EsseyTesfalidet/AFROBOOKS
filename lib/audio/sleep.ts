import type { SleepTimer } from '@/store/audioStore';
export function sleepReached(timer:SleepTimer,titleId:string,seconds:number,now=Date.now()) {
  return !!timer&&(timer.mode==='time'?now>=timer.deadline:timer.titleId===titleId&&seconds>=timer.position);
}
