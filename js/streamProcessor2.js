// streamProcessor2.js — KNI(WebGL2) 가 소리를 내는 오디오 워클릿.
//
// 왜 이 파일이 여기 있나: KNI 의 브라우저 백엔드는 `DynamicSoundEffectInstance` 를
// AudioWorklet 으로 재생하면서 `js/streamProcessor2.js` 를 **wwwroot 뿌리 기준**으로 찾는다
// (실물 = Kni.Platform 안의 경로 문자열). 그런데 NuGet 패키지는 이 파일을 싣지 않는다 —
// KNI 의 프로젝트 템플릿에만 있다. 없으면 시작할 때 404 가 나고 **소리가 하나도 안 난다**
// (엔진의 모든 목소리가 DynamicSoundEffectInstance 다 · 실측 2026-09-13).
//
// 출처 = kniEngine/kni 템플릿 `Templates/dotnetTemplates/content/BlazorGL.NetCore.CSharp/
// wwwroot/js/streamProcessor2.js` (MIT) — 판은 런타임 판(4.3.9001)을 따라간다. 손대지 않는다:
// 이 파일과 엔진 쪽이 주고받는 숫자(2=비우기 3=멈춤 4=재개 5=음높이 6=표본율 7=채널)가 계약이다.
// 판을 올릴 때는 같은 자리의 파일로 통째로 갈아 끼운다.
//
// (4.2 의 같은 자리 파일은 이름이 `streamProcessor.js` 이고 표본율·채널을 보지 않는다 —
//  런타임을 4.2 로 내리면 스테레오 음원이 뭉개지는 이유가 이것이다.)
//   streamProcessor2.js
class StreamProcessor extends AudioWorkletProcessor
{
    constructor()
    {
        super();
        this.queue = [];
        this.samplePosition = 0;
        this.paused = false;
        this.pitchPlaybackRate = 1;
        this.formatSampleRate = 44100;
        this.formatChannels = 1;
        this.receivingValueForMessageType = -1;

        this.port.onmessage = (event) =>
        {
            var data = event.data;

            if (typeof data === 'number')
            {
                if (this.receivingValueForMessageType === -1)
                {
                    switch (data)
                    {
                        case 2:
                            this.queue = []; break;
                        case 3:
                            this.paused = true; break;
                        case 4:
                            this.paused = false; break;
                        case 5:
                        case 6:
                        case 7:
                            this.receivingValueForMessageType = data;
                            break;
                    }
                }
                else
                {
                    switch (this.receivingValueForMessageType)
                    {
                        case 5:
                            this.pitchPlaybackRate = data; break;
                        case 6:
                            this.formatSampleRate = data; break;
                        case 7:
                            this.formatChannels = data; break;
                    }
                    this.receivingValueForMessageType = -1;
                }
            }
            if (data instanceof Uint8Array)
            {
                const buffer = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
                this.queue.push(buffer);
            }
        };
    }


    process(inputs, outputs, parameters)
    {
        const inputChannelCount = this.formatChannels;
        const formatPlaybackRate = this.formatSampleRate / sampleRate;
        const playbackRate = formatPlaybackRate * this.pitchPlaybackRate;

        const output = outputs[0];
        const outputChannelCount = output.length;
        const outputSampleCount = output[0].length;

        let written = 0;

        while (written < outputSampleCount && this.queue.length > 0 && !this.paused)
        {
            const buffer = this.queue[0];
            const samplesInBuffer = buffer.length / inputChannelCount;
            let nextSamplePosition = this.samplePosition;

            while (written < outputSampleCount && nextSamplePosition < samplesInBuffer)
            {
                let offset = Math.floor(nextSamplePosition) * inputChannelCount;
                for (let outputChannel = 0; outputChannel < outputChannelCount; outputChannel++)
                {
                    let inputChannel = outputChannel % inputChannelCount;
                    let value1 = buffer[offset + inputChannel];
                    let value2;
                    if (nextSamplePosition < samplesInBuffer - 1)
                        value2 = buffer[offset + inputChannelCount + inputChannel];
                    else if (this.queue.length > 1)
                        value2 = this.queue[1][inputChannel];
                    else
                        value2 = value1;
                    let value = (value1 + ((value2 - value1) * (nextSamplePosition % 1))) / 32768;
                    output[outputChannel][written] = value;
                }
                written++;
                nextSamplePosition += playbackRate;
            }

            if (nextSamplePosition >= samplesInBuffer)
            {
                nextSamplePosition -= samplesInBuffer;
                this.queue.shift();
                this.port.postMessage(1);
            }

            this.samplePosition = nextSamplePosition;
        }
        
        // Fill remaining samples with silence
        if (written < outputSampleCount)
        {
            for (let outputChannel = 0; outputChannel < outputChannelCount; outputChannel++)
            {
                for (let i = written; i < outputSampleCount; i++)
                {
                    output[outputChannel][i] = 0;
                }
            }
        }

        return true;
    }
}

registerProcessor("stream-processor", StreamProcessor);
