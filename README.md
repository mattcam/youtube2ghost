# YouTube to Ghost Blog Post

This script processes a YouTube video URL to download the audio, transcribe it, generate a summary, title, teaser, and call-to-action (CTA), and create a draft post in a Ghost blog using the Ghost Admin API.

## Prerequisites

- Node.js
- FFmpeg
- Whisper (for transcription)
- Ollama with LLM llama3 installed (for genAI)
- Ghost blog with Admin API access
- yt-dlp

Note that some of these dependencies can be installed via brew.

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/mattcam/youtube2ghost.git
    cd youtube2ghost
    ```


2. Install dependencies:

    ```bash
    npm install
    ```

3. Ensure FFmpeg is installed and available in your system's PATH.

## Configuration

Create a config.yaml file with the following structure:


```yaml
prompts:
    title: "Provide an engaging post title for the following content: {transcript}"
    teaser: "Provide an engaging post teaser for the following content: {transcript}"
    summary: "Provide the top nine key takeaways with emojis from the following: {transcript}"
    cta: "Provide an engaging call to action to encourage a comment on the post with the following content: {transcript}"
directory: "/path/to/your/directory"
ghost:
    url: "https://your-ghost-blog-url"
    key: "your-ghost-admin-api-key"
```

4. Create working directory `/path/to/your/directory`

## Usage

Run the script with the YouTube video URL and the path to your configuration file:

```bash
node index.js <YouTube_URL> <path_to_config.yaml>
```

For example:

```bash
node app.js https://www.youtube.com/watch?v=example /path/to/config.yaml
```

## Notes

- Files generated by the application will be stored in the working directory using the YouTube ID as the file name. If a file exists then the corresponding function in the application will not be rerun. 

## Contributing

Use issues for all questions and feature requests.

## License

This project is licensed under the MIT License.
