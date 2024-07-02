const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const axios = require('axios');
const FormData = require('form-data');
const yaml = require('js-yaml');
const { ArgumentParser } = require('argparse');
const GhostAdminAPI = require('@tryghost/admin-api');
const showdown = require('showdown');
const sharp = require('sharp');

ffmpeg.setFfmpegPath(ffmpegPath);

const downloadYouTubeAudio = async (url, outputPath) => {
    if (fs.existsSync(outputPath)) {
        console.log('Audio file already exists, skipping download.');
        return;
    }

    const audioStream = ytdl(url, { quality: 'highestaudio' });
    const ffmpegCommand = ffmpeg()
        .input(audioStream)
        .audioBitrate('192k')
        .audioCodec('pcm_s16le')
        .format('wav')
        .output(outputPath)
        .on('end', () => console.log('Audio conversion completed'))
        .on('error', (err) => console.error('Error during audio conversion:', err));

    await new Promise((resolve, reject) => {
        ffmpegCommand.on('end', resolve).on('error', reject).run();
    });
};

const transcribeAudio = async (audioFile, outputFile) => {
    if (fs.existsSync(audioFile.replace('.wav','.txt'))) {
        console.log('Transcript file already exists, skipping transcription.');
        return;
    }

    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
        exec(`whisper ${audioFile} -o ${outputFile}`, (error, stdout, stderr) => {
            if (error) {
                reject(`Error: ${error.message}`);
            } else {
                resolve();
            }
        });
    });
};

const generateSummary = async (transcript, prompt, model = 'llama3') => {
    const question = prompt.replace('{transcript}', transcript.replace(/[^A-Za-z\s]/g, '').replace(/\n/g, ''));
    const promptData = {
        model: model,
        stream: false,
        prompt: question,
    };

    try {
        const response = await axios.post('http://localhost:11434/api/generate', promptData);
        return response.data.response || 'Failed to generate summary';
    } catch (error) {
        return 'Failed to generate summary';
    }
};

const extractYouTubeId = (url) => {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('v');
};

const getYouTubeThumbnail = (youtubeId) => {
    return `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
};

const readImageFile = async (imagePath) => {
    try {
        const imageBuffer = await fs.promises.readFile(imagePath);
        return imageBuffer;
    } catch (error) {
        console.error('Failed to read image file:', error.message);
        throw error;
    }
};

const playButtonSVG = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 100">
  <rect x="0" y="0" width="150" height="100" rx="25" ry="25" fill="rgba(255,0,0,0.8)" />
  <polygon points="55,25 95,50 55,75" fill="white"/>
</svg>
`);

const addPlayButtonOverlay = async (thumbnailPath, outputPath) => {
    try {
        await sharp(thumbnailPath)
            .composite([{ input: playButtonSVG, gravity: 'center' }])
            .toFile(outputPath);
        console.log('Play button overlay added successfully');
    } catch (error) {
        console.error('Failed to add play button overlay:', error.message);
        throw error;
    }
};

const uploadGhostImage = async (ghostApi, imagePath) => {
    try {
        const imageBuffer = await readImageFile(imagePath);

        const formData = new FormData();
        formData.append('file', imageBuffer, {
            filename: path.basename(imagePath),
            contentType: 'image/jpeg'
        });

        const uploadedImage = await ghostApi.images.upload(formData);

        console.log('Image uploaded successfully:', uploadedImage.url);
        return uploadedImage.url;
    } catch (error) {
        console.error('Failed to upload image:', error.message);
        throw new Error('Failed to upload image');
    }
};

const createGhostPost = async (apiUrl, adminApiKey, title, body, featureImage, codeInjectionHead) => {
    var converter = new showdown.Converter();
    const ghost = new GhostAdminAPI({
        url: apiUrl,
        key: adminApiKey,
        version: 'v5.0'
    });

    try {
        await ghost.posts.add({
            title: title,
           html: converter.makeHtml(body),
           status: 'draft',
           feature_image: featureImage,
           codeinjection_head: codeInjectionHead
        },
        {source: 'html'}
        );

        console.log('Draft post created successfully');
    } catch (error) {
        console.error(`Failed to create draft post: ${error}`);
    }
};

const main = async () => {
    const parser = new ArgumentParser({ description: 'Process YouTube video URL and configuration file.' });
    parser.add_argument('url', { type: 'str', help: 'YouTube video URL' });
    parser.add_argument('config', { type: 'str', help: 'Configuration file with prompts and paths' });

    const args = parser.parse_args();
    const { url, config } = args;

    try {
        const configFile = fs.readFileSync(config, 'utf8');
        const configData = yaml.load(configFile);

        const prompts = configData.prompts || {};
        const { summary: summaryPrompt, title: titlePrompt, teaser: teaserPrompt, cta: ctaPrompt } = prompts;

        const directory = configData.directory;
        const ghostUrl = configData.ghost.url;
        const ghostKey = configData.ghost.key;

        if (!directory || !ghostUrl || !ghostKey) {
            console.log('Missing directory path or Ghost credentials in the configuration file.');
            return;
        }

        const youtubeId = extractYouTubeId(url);
        if (!youtubeId) {
            console.log('Invalid YouTube URL. Exiting the process.');
            return;
        }

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        const audioFilePath = path.join(directory, `${youtubeId}.wav`);
        const transcriptFilePath = path.join(directory, `${youtubeId}.txt`);

        await downloadYouTubeAudio(url, audioFilePath);
        await transcribeAudio(audioFilePath, directory);

        if (fs.existsSync(transcriptFilePath)) {
            const transcript = fs.readFileSync(transcriptFilePath, 'utf8');

            const content = await generateSummary(transcript, summaryPrompt);
            const title = await generateSummary(content, titlePrompt);
            const teaser = await generateSummary(content, teaserPrompt);
            const cta = await generateSummary(content, ctaPrompt);

            const body = `${title}\n\n${url}\n\n${teaser}\n\n${content}\n\n${cta}`;
            const codeInjectionHead = '<style>figure.gh-article-image {display:none;}</style>';
            const thumbnailPath = path.join(directory, `${youtubeId}.jpg`);
            const outputPath = path.join(directory, `${youtubeId}_with_button.jpg`);
            const thumbnailUrl = getYouTubeThumbnail(youtubeId);

            const response = await axios({ url: thumbnailUrl, responseType: 'stream' });
            response.data.pipe(fs.createWriteStream(thumbnailPath));
            await new Promise((resolve, reject) => {
                response.data.on('end', resolve);
                response.data.on('error', reject);
            });

            await addPlayButtonOverlay(thumbnailPath, outputPath);
            const ghostApi = new GhostAdminAPI({
                url: ghostUrl,
                key: ghostKey,
                version: 'v5.0'
            });

            const featureImage = await uploadGhostImage(ghostApi, outputPath);

            await createGhostPost(ghostUrl, ghostKey, youtubeId, body, featureImage, codeInjectionHead);
        } else {
            console.log('Transcription failed. Exiting the process.');
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
};

main();
