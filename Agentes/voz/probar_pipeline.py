"""Comprueba la inicialización real de Silero/espera de silencio sin modelos Ollama ni audios."""
import asyncio
from loguru import logger
logger.remove()
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.turns.user_stop.speech_timeout_user_turn_stop_strategy import SpeechTimeoutUserTurnStopStrategy
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineWorker, PipelineParams
from pipecat.workers.runner import WorkerRunner
from pipecat.frames.frames import EndFrame

class Paso(FrameProcessor):
    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)

async def comprobar():
    usuario = LLMContextAggregatorPair(LLMContext([]), user_params=LLMUserAggregatorParams(user_turn_strategies=UserTurnStrategies(stop=[SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)]))).user()
    worker = PipelineWorker(Pipeline([Paso(), VADProcessor(vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=2.0))), usuario, Paso()]), enable_rtvi=False, idle_timeout_secs=None, params=PipelineParams(audio_in_sample_rate=16000))
    preparado = asyncio.Event()
    @worker.event_handler('on_pipeline_started')
    async def al_iniciar(_worker, _frame):
        preparado.set()
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    tarea = asyncio.create_task(runner.run())
    try:
        await asyncio.wait_for(preparado.wait(), 30)
        await worker.queue_frames([EndFrame()])
        await asyncio.wait_for(tarea, 30)
        print('Pipecat: Silero, espera de silencio y agregador inicializaron y finalizaron correctamente a 16 kHz. Sin transcribir audio ni descargar modelos Ollama.')
    finally:
        if not tarea.done():
            await runner.cancel()
            await asyncio.gather(tarea, return_exceptions=True)

if __name__ == '__main__':
    asyncio.run(comprobar())
