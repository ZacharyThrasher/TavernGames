# **Architectural Blueprint for Autonomous Asset Orchestration: The Freesound Fetcher Skill for Codex CLI**

## **1\. Executive Summary**

The modern software development lifecycle (SDLC) has evolved from a text-centric discipline into a multimodal orchestration of logic, configuration, and digital assets. While Integrated Development Environments (IDEs) have matured to assist with code syntax and structural logic, the acquisition and integration of binary assets—specifically audio files for interactive media, game development, and user interface (UI) design—remains a fragmented, manual process. This "Asset Gap" forces developers to context-switch away from their coding environment to browse external repositories, evaluate licensing terms, download files, and manually migrate them into project directories.  
The emergence of agentic coding assistants, specifically the OpenAI Codex CLI, offers a mechanism to bridge this gap. By leveraging the **Open Agent Skills Standard**, developers can encapsulate complex workflows into "Skills"—autonomous modules that extend the agent's capabilities beyond text generation to system interaction.  
This report presents a comprehensive technical analysis and implementation guide for the **Freesound Fetcher Skill**. This skill acts as an autonomous sub-agent designed to interpret natural language requests for audio (e.g., "I need a coin sound"), interface with the Freesound.org API, strictly filter for Creative Commons Zero (CC0) compliance to ensure legal safety, download the asset, and intelligently integrate it into the project's directory structure based on heuristic analysis of the codebase.  
The following analysis details the architectural principles of Codex Skills, the technical constraints of the Freesound API, the heuristic algorithms required for project-aware file placement, and the prompt engineering strategies necessary to facilitate seamless human-agent collaboration in asset operations.

## ---

**2\. Theoretical Framework: Agentic Asset Operations**

### **2.1 The Asset Gap in Software Development**

In the domain of interactive software—ranging from AAA game development to responsive web applications—code and assets are inextricably linked. A line of code triggering an event (e.g., audioSource.Play()) is functionally incomplete without the corresponding binary asset. Traditionally, the "Inner Loop" of development involves writing the logic, pausing to source the asset, implementing the asset, and then resuming logic.  
Research into developer productivity indicates that these context switches incur a significant cognitive penalty. The "Freesound Fetcher" skill addresses this by keeping the developer within the terminal environment. By treating asset acquisition as a CLI-invokable function, the workflow shifts from a manual "search-and-retrieve" process to a declarative "request-and-receive" interaction.

### **2.2 The Codex Skills Architecture**

The Codex CLI operates on a modular architecture designed to balance the broad reasoning capabilities of Large Language Models (LLMs) with the specific, deterministic needs of local execution. This is achieved through the **Open Agent Skills Standard**, which defines a skill as a directory containing metadata, instructions, and executable resources.1

#### **2.2.1 Progressive Disclosure and Context Management**

A critical constraint in LLM-based tools is the context window. Loading the definitions, documentation, and source code for every possible tool a developer might use would rapidly exhaust the model's memory. Codex addresses this through **Progressive Disclosure**. At startup, the agent loads only the *definitions* (names and descriptions) of available skills from the .codex/skills directory.1  
When a user issues a prompt, the routing layer evaluates the intent against these descriptions. Only when a high-probability match occurs—for instance, matching "download sound" to the freesound-fetcher description—does the system load the full SKILL.md instruction set and expose the underlying scripts to the context.2 This architectural pattern ensures that the specialized logic for audio retrieval does not pollute the general coding context until it is explicitly required.

#### **2.2.2 The Execution Bridge: SKILL.md vs. scripts/**

The skill architecture enforces a separation of concerns between *reasoning* and *execution*.

* **Reasoning (SKILL.md):** This Markdown file serves as the "System Prompt" for the skill. It contains natural language instructions that guide the LLM on how to interpret user requests, handle ambiguity, and formulate commands.1  
* **Execution (scripts/):** Because LLMs are probabilistic, they cannot be trusted to execute deterministic API calls or file system operations directly via generated code blocks (which may hallucinate parameters). Instead, the architecture mandates wrapping deterministic logic—such as HTTP requests and file I/O—into robust scripts (e.g., Python or Bash) located in the scripts/ subdirectory.1

The Freesound Fetcher leverages this by using SKILL.md to parse the user's aesthetic intent (e.g., "somber ambient background") and a Python script to handle the rigid requirements of the Freesound API and local file system permissions.

## ---

**3\. External Datasource Analysis: The Freesound Ecosystem**

To automate the retrieval of "free sounds," the system requires a reliable, legally safe, and API-accessible repository. **Freesound.org**, hosted by the Music Technology Group at Universitat Pompeu Fabra, represents the optimal datasource due to its massive collection of Creative Commons audio and its mature RESTful API.5

### **3.1 Licensing Compliance: The CC0 Imperative**

A primary requirement for any automated asset acquisition tool is legal safety. In software development, inadvertently including a "Creative Commons Attribution" (CC-BY) or "Non-Commercial" (CC-NC) file in a commercial project can lead to significant legal liability.  
The Freesound API allows for granular filtering by license type. To ensure the "Freesound Fetcher" is safe for professional use by default, the architecture mandates a hard filter for **Creative Commons Zero (CC0)**. CC0 places the work in the public domain, waiving all copyright and related rights, thus allowing developers to "insert" the sound into their game or app without tracking attribution or worrying about commercial restrictions.6  
While the API supports other licenses, the autonomous nature of the tool—where the user might not see the metadata before the file lands in their project—necessitates this strict default. The Python script acts as the "Policy Enforcement Point," hardcoding this filter to prevent the LLM from hallucinating a laxer search query.6

### **3.2 Authentication and API Architecture**

The Freesound API (v2) employs a bifurcated authentication model that presents a specific challenge for CLI tools.8

| Authentication Method | Capabilities | Complexity | CLI Suitability |
| :---- | :---- | :---- | :---- |
| **Token Authentication** | Search, Metadata, Preview Downloads | Low (Single API Key) | **High** |
| **OAuth2** | Original File Download, Upload, Rating | High (Requires Browser Callback) | Low |

The critical distinction lies in the download capability. The API documentation states that downloading the *original* uploaded file (which could be a 50MB WAV) requires OAuth2 authentication.10 Implementing an OAuth2 flow in a terminal tool disrupts the user experience, requiring them to leave the terminal, authenticate in a browser, and paste a code back.  
However, analysis of the API response structure reveals that **High-Quality Previews** (typically 320kbps MP3s or OGGs) are accessible via direct URLs in the search results object, and these URLs do not require OAuth2—only the initial search requires the Token.11 For the vast majority of use cases—prototyping, game jams, and mobile apps—these HQ previews are indistinguishable from the source for end-users. Therefore, the "Freesound Fetcher" utilizes Token Authentication to minimize configuration friction, targeting the preview streams rather than the protected original files.

### **3.3 Search and Metadata Heuristics**

Effective retrieval relies on utilizing the API's rich metadata. The skill must translate vague user requests into precise API queries.

* **Query Expansion:** The LLM in SKILL.md can expand a user's request for "scary sound" into a query for scary OR horror OR eerie.  
* **Sorting:** To ensure quality without human curation, the API query will default to sort=rating\_desc, prioritizing community-validated assets.13  
* **Field Filtering:** To optimize bandwidth and latency, the script requests only essential fields: id, name, previews, duration, license, and type.13

## ---

**4\. Technical Implementation: The Python Subsystem**

The core operational logic of the skill is encapsulated in a Python script, provisionally named fetch\_sfx.py. This script serves as the bridge between the Codex agent's intent and the physical reality of the network and file system.

### **4.1 Dependency Management Strategy**

While Python's standard library urllib is capable of HTTP requests 14, the complexity of handling redirects, SSL verification, and timeout logic in a production-grade tool necessitates the use of requests. Although this introduces a dependency, the reliability gains outweigh the setup cost. The skill folder includes a requirements.txt listing requests and pathlib.  
The script design follows a "Systems Programming" approach, prioritizing robustness and explicit error reporting (via JSON to stdout) over human-readable logs, as the primary consumer of the output is the Codex Agent, not the human user.

### **4.2 Module 1: Intelligent Project Heuristics**

The prompt requires the skill to "insert \[the sound\] into the game." This implies not just downloading the file, but placing it where the game engine expects it. A naive implementation would dump files in the current working directory (CWD), forcing the user to move them manually. A sophisticated implementation uses heuristic scanning to identify the project type and the appropriate asset root.15  
The ProjectScanner class implements the following logic:

1. **Unity Detection:** Checks for ProjectSettings/ProjectSettings.asset or Assets/. If found, targets Assets/Resources/Audio (creating it if necessary) to ensure the file is immediately loadable via Resources.Load().  
2. **Unreal Engine Detection:** Checks for \*.uproject. If found, targets Content/Audio.  
3. **Web (Node/React/Vue):** Checks for package.json. If found, scans for public/, static/, or src/assets/.  
4. **Godot:** Checks for project.godot. Targets res://audio (mapped to the local path).  
5. **Python Data Science:** Checks for requirements.txt or setup.py. Targets data/audio or assets/.  
6. **Fallback:** If no known structure is detected, creates a freesound\_downloads folder in the CWD to avoid cluttering the root.

This logic transforms the tool from a "downloader" into an "integrator," fulfilling the "insert into the game" requirement.

### **4.3 Module 2: The API Client Wrapper**

The FreesoundClient class encapsulates the HTTP logic. It constructs the query with the mandatory safety filters.

Python

def search\_assets(query, api\_key, limit=5):  
    """  
    Executes a search against Freesound.org API v2.  
    Enforces CC0 licensing and sorts by rating.  
    """  
    base\_url \= "https://freesound.org/apiv2/search/text/"  
    headers \= {"Authorization": f"Token {api\_key}"}  
    params \= {  
        "query": query,  
        "filter": 'license:"Creative Commons 0"',  \# HARDCODED SAFETY  
        "fields": "id,name,previews,duration,username,type",  
        "sort": "rating\_desc",  
        "page\_size": limit  
    }  
      
    try:  
        response \= requests.get(base\_url, headers=headers, params=params, timeout=10)  
        response.raise\_for\_status()  
        return response.json().get('results',)  
    except requests.exceptions.RequestException as e:  
        \# Return structured error for the Agent to interpret  
        return {"error": str(e), "type": "network\_error"}

This enforcement at the code level is superior to prompt-level enforcement, as it prevents "jailbreaking" where a user might try to convince the LLM to ignore copyright.6

### **4.4 Module 3: The Atomic Downloader**

Downloading files in an agentic context requires handling concurrency and naming collisions. If a user asks for "jump" twice, the second download shouldn't overwrite jump.mp3.  
The AssetDownloader implements:

1. **Sanitization:** Cleaning filenames of illegal characters (e.g., converting "Coin Drop \#2\!" to coin\_drop\_2.mp3).  
2. **Collision Resolution:** Checking if the target file exists and appending a specialized counter (e.g., coin\_drop\_2\_01.mp3) before writing.  
3. **Stream Processing:** Using requests.iter\_content to stream the binary data to disk, keeping memory usage low even for large ambience files.14

### **4.5 The Complete Python Implementation**

Below is the synthesis of these modules into the executable script fetch\_sfx.py.

Python

\#\!/usr/bin/env python3  
import os  
import sys  
import argparse  
import json  
import re  
import requests  
from pathlib import Path

\# \--- Configuration \---  
API\_KEY\_ENV \= "FREESOUND\_API\_KEY"

\# \--- Heuristic Scanner Module \---  
def detect\_asset\_root():  
    """  
    Scans the current directory structure to determine the   
    optimal placement for audio assets.  
    """  
    cwd \= Path.cwd()  
      
    \# Unity  
    if (cwd / "Assets").exists() or (cwd / "ProjectSettings").exists():  
        target \= cwd / "Assets" / "Resources" / "Audio"  
        target.mkdir(parents=True, exist\_ok=True)  
        return target, "Unity"  
          
    \# Unreal  
    if list(cwd.glob("\*.uproject")) or (cwd / "Content").exists():  
        target \= cwd / "Content" / "Audio"  
        target.mkdir(parents=True, exist\_ok=True)  
        return target, "Unreal"  
          
    \# Web (Standard)  
    if (cwd / "package.json").exists():  
        if (cwd / "public").exists():  
            target \= cwd / "public" / "audio"  
            target.mkdir(parents=True, exist\_ok=True)  
            return target, "Web (Public)"  
        if (cwd / "src" / "assets").exists():  
            target \= cwd / "src" / "assets" / "audio"  
            target.mkdir(parents=True, exist\_ok=True)  
            return target, "Web (Assets)"

    \# Godot  
    if (cwd / "project.godot").exists():  
        target \= cwd / "assets" / "audio"  
        target.mkdir(parents=True, exist\_ok=True)  
        return target, "Godot"

    \# Default Fallback  
    target \= cwd / "downloaded\_sfx"  
    target.mkdir(exist\_ok=True)  
    return target, "Generic"

\# \--- API Interaction Module \---  
def search\_freesound(query, api\_key, limit):  
    url \= "https://freesound.org/apiv2/search/text/"  
    headers \= {'Authorization': f'Token {api\_key}'}  
    params \= {  
        'query': query,  
        'filter': 'license:"Creative Commons 0"',   
        'fields': 'id,name,previews,duration,username,type',  
        'sort': 'rating\_desc',  
        'page\_size': limit  
    }  
      
    try:  
        resp \= requests.get(url, headers=headers, params=params, timeout=10)  
        resp.raise\_for\_status()  
        return resp.json().get('results',)  
    except Exception as e:  
        return {"error": str(e)}

\# \--- Download Module \---  
def download\_asset(url, name, ext, target\_dir):  
    \# Sanitize name  
    clean\_name \= re.sub(r'\[^\\w\\-\_\]', '\_', name.replace(' ', '\_')).lower()  
    filename \= f"{clean\_name}.{ext}"  
    filepath \= target\_dir / filename  
      
    \# Handle collisions  
    counter \= 1  
    while filepath.exists():  
        filepath \= target\_dir / f"{clean\_name}\_{counter}.{ext}"  
        counter \+= 1  
          
    try:  
        with requests.get(url, stream=True) as r:  
            r.raise\_for\_status()  
            with open(filepath, 'wb') as f:  
                for chunk in r.iter\_content(chunk\_size=8192):  
                    f.write(chunk)  
        return str(filepath)  
    except Exception as e:  
        return None

\# \--- Main Logic \---  
def main():  
    parser \= argparse.ArgumentParser()  
    parser.add\_argument("query", help="Search query")  
    parser.add\_argument("--auto", action="store\_true", help="Auto-download top result")  
    parser.add\_argument("--limit", type=int, default=5, help="Number of results to return")  
    args \= parser.parse\_args()

    api\_key \= os.environ.get(API\_KEY\_ENV)  
    if not api\_key:  
        print(json.dumps({"status": "error", "message": f"Missing {API\_KEY\_ENV}"}))  
        sys.exit(1)

    \# Execute Search  
    results \= search\_freesound(args.query, api\_key, args.limit)  
      
    if isinstance(results, dict) and "error" in results:  
        print(json.dumps({"status": "error", "message": results\["error"\]}))  
        sys.exit(1)  
          
    if not results:  
        print(json.dumps({"status": "empty", "message": "No CC0 sounds found."}))  
        sys.exit(0)

    \# Handle Actions  
    if args.auto:  
        \# Automatic Mode: Download the best match  
        target\_dir, project\_type \= detect\_asset\_root()  
        top\_hit \= results  
          
        \# Prefer HQ MP3, fall back to LQ  
        download\_url \= top\_hit\['previews'\].get('preview-hq-mp3') or top\_hit\['previews'\].get('preview-lq-mp3')  
          
        if download\_url:  
            path \= download\_asset(download\_url, top\_hit\['name'\], "mp3", target\_dir)  
            if path:  
                print(json.dumps({  
                    "status": "success",  
                    "action": "downloaded",  
                    "file\_path": path,  
                    "project\_type": project\_type,  
                    "metadata": top\_hit  
                }))  
            else:  
                print(json.dumps({"status": "error", "message": "Download failed during write."}))  
        else:  
            print(json.dumps({"status": "error", "message": "No preview URL available."}))  
              
    else:  
        \# Interactive Mode: Return list for Agent to present  
        print(json.dumps({  
            "status": "success",  
            "action": "list",  
            "results": results  
        }))

if \_\_name\_\_ \== "\_\_main\_\_":  
    main()

## ---

**5\. Interface Design: The SKILL.md Specification**

The Python script provides the capability, but the SKILL.md provides the *intelligence*. It bridges the gap between the user's "I need a coin sound" and the script's strict argument requirements.

### **5.1 Prompt Engineering for Asset Ops**

The instructions in SKILL.md must handle several cognitive tasks:

1. **Intent Classification:** Distinguish between a request to *explore* ("Show me some drum sounds") and a request to *acquire* ("Get me a drum sound").  
2. **Parameter Extraction:** Extract the semantic search terms while ignoring conversational fluff.  
3. **Output Parsing:** Interpret the JSON output from the script and generate a context-aware response that explains *where* the file went and *how* to use it.

### **5.2 The SKILL.md Implementation**

The file must be placed at \~/.codex/skills/freesound-fetcher/SKILL.md.

## ---

**name: freesound-fetcher description: Finds, downloads, and integrates free (CC0) sound effects into the project assets folder. Use this when the user requests audio assets, sound effects, foley, or background music. metadata: short-description: Download CC0 sound effects. author: Domain Expert version: 1.0.0**

# **Freesound Fetcher Skill**

You are an expert Asset Orchestrator. Your goal is to satisfy the user's need for audio assets by interfacing with the Freesound.org database via the provided python script.

## **🛠️ Prerequisites & Environment**

1. **API Key Check:** You must verify that the FREESOUND\_API\_KEY environment variable is set.  
   * If the script returns an error regarding the key, STOP and politely ask the user to provide their Freesound API Key, explaining it is free to obtain.  
2. **Tool Use:** You DO NOT have general internet access for this task. You MUST use the scripts/fetch\_sfx.py script.

## **🧠 Workflow & Chain of Thought**

### **Step 1: Analyze Intent**

* If the user implies **immediate need** (e.g., "I need a coin sound", "Download a click"), you will use the \--auto flag to download the best match immediately.  
* If the user implies **exploration** (e.g., "Find me some options", "Search for"), you will run the script *without* flags to retrieve a list.

### **Step 2: Execution**

Construct the command using the user's semantic query.

* **Auto Mode:** python3 scripts/fetch\_sfx.py "search terms" \--auto  
* **List Mode:** python3 scripts/fetch\_sfx.py "search terms"

### **Step 3: Response & Integration**

The script outputs JSON. You must parse this JSON to provide a helpful response.

#### **Scenario A: Successful Download ("status": "success", "action": "downloaded")**

The file is now on the disk. The JSON provides the file\_path and project\_type.

1. **Confirm:** Tell the user the file has been downloaded to file\_path.  
2. **Integrate:** Based on the project\_type returned by the script, generate the specific code snippet to use this sound.  
   * **Unity:** "You can load this using Resources.Load\<AudioClip\>("Audio/filename");"  
   * **Web:** "You can import this: import sound from './assets/audio/filename.mp3';"  
   * **Generic:** "The file is ready for import."

#### **Scenario B: Selection Required ("status": "success", "action": "list")**

Present the top 3-5 results in a readable table (Name, Duration, User). Ask the user to select one.

* When they select one, run the script again with that specific name as the query and the \--auto flag.

#### **Scenario C: Error ("status": "error")**

Explain the error clearly. If it is a network error, suggest checking the connection. If "No results", suggest broader search terms.

## **⚠️ Safety Guidelines**

* **License:** The script enforces CC0. Do not override this or promise copyrighted material.  
* **Privacy:** Do not output the raw JSON to the user. Summarize it naturally.

## ---

**6\. Integration Scenarios: From Request to Code**

To validate the utility of this architecture, we analyze three distinct development scenarios where this skill bridges the Asset Gap.

### **6.1 Scenario A: The Unity Game Developer**

**Context:** The user is working in a C\# script for a "Coin" object and realizes they lack the audio feedback.  
**User Query:** "I need a pickup sound effect for this coin script. Insert it into the game."  
**System Execution Flow:**

1. **Routing:** Codex matches "pickup sound" to freesound-fetcher.  
2. **Heuristics:** detect\_asset\_root() sees Assets/ and targets Assets/Resources/Audio/.  
3. **API Call:** Searches pickup coin with license:CC0.  
4. **Download:** Retrieves coin\_pickup.mp3 to Assets/Resources/Audio/coin\_pickup.mp3.  
5. **Integration Logic (LLM):** The agent sees the file path and the Unity context.  
6. **Agent Response:**"I've downloaded a CC0 coin pickup sound to Assets/Resources/Audio/coin\_pickup.mp3.  
   To insert it into your game, add this to your Coin script:"  
   C\#  
   // Add to your class variables  
   public AudioClip coinSound;

   void Start() {  
       // Automatically load the asset we just downloaded  
       coinSound \= Resources.Load\<AudioClip\>("Audio/coin\_pickup");  
   }

   void OnTriggerEnter(Collider other) {  
       if (other.CompareTag("Player")) {  
           AudioSource.PlayClipAtPoint(coinSound, transform.position);  
           Destroy(gameObject);  
       }  
   }

### **6.2 Scenario B: The React Web Developer**

**Context:** A developer is building a UI button component.  
**User Query:** "Get a click sound for this button."  
**System Execution Flow:**

1. **Heuristics:** detect\_asset\_root() scans package.json, finds src/assets, targets src/assets/audio/.  
2. **Download:** Saves ui\_click.mp3 to src/assets/audio/ui\_click.mp3.  
3. **Integration Logic (LLM):** Recognized Web (Assets) project type.  
4. **Agent Response:**"I've fetched a click sound and saved it to src/assets/audio/ui\_click.mp3.  
   Here is how you can bind it to your button component:"  
   JavaScript  
   import clickSound from '../assets/audio/ui\_click.mp3';

   const Button \= () \=\> {  
     const playSound \= () \=\> {  
       new Audio(clickSound).play();  
     };

     return \<button onClick={playSound}\>Click Me\</button\>;  
   };

This demonstrates the skill fulfilling the "insert into the game" requirement by providing the necessary glue code based on the heuristic context.

## ---

**7\. Advanced Topics and Future Directions**

### **7.1 Enhancing Retrieval with Audio Similarity**

The current implementation relies on text-to-metadata matching. However, audio is often abstract. Freesound supports content-based search (Audio Similarity) using the Essentia library. Future versions of this skill could implement a "More Like This" feature. If the user has a local file thud.wav, the skill could upload it (or analyze it locally to extract MFCCs/spectral centroid) and query the API for perceptually similar sounds.5 This would move the skill from "Keyword Search" to "Aural Search."

### **7.2 Token Economics and Caching**

Repeatedly querying the API consumes bandwidth and API quotas. An advanced implementation would introduce a local caching layer (SQLite or simple JSON store) within \~/.codex/cache. Before hitting the API, the script would check if query="explosion" was run recently and offer the previously cached results, reducing latency and API load.

### **7.3 Enterprise Governance**

In corporate environments, "free assets" are often a compliance vector. An enterprise-grade version of this skill would integrate with a centralized allow-list or require a secondary approval step where the downloaded asset's license URL is logged to a compliance.md file in the project root. The SKILL.md can be modified to enforce this logging step as a mandatory post-download action.

## ---

**8\. Conclusion**

The "Freesound Fetcher" skill demonstrates the transformative potential of the Codex CLI when extended via the Agent Skills Standard. By moving beyond simple code generation to handle the full lifecycle of asset acquisition—from search and licensing compliance to heuristic placement and code integration—we create a development environment that maintains developer flow state.  
The architecture presented here—leveraging **Progressive Disclosure**, **Heuristic Project Scanning**, and **Chain-of-Thought Prompt Engineering**—provides a robust template for any developer wishing to automate the non-coding aspects of software creation. As agentic tools mature, such "Asset Ops" capabilities will become standard, rendering the manual "browser-download-drag-drop" loop an artifact of the past.

### ---

**Citations**

.1

#### **Works cited**

1. Agent Skills \- OpenAI for developers, accessed January 26, 2026, [https://developers.openai.com/codex/skills/](https://developers.openai.com/codex/skills/)  
2. Codex Skills Explained: The Complete Guide to Automating Your ..., accessed January 26, 2026, [https://medium.com/@proflead/codex-skills-explained-the-complete-guide-to-automating-your-prompts-26dd5a89d580](https://medium.com/@proflead/codex-skills-explained-the-complete-guide-to-automating-your-prompts-26dd5a89d580)  
3. Skills in OpenAI Codex \- Massively Parallel Procrastination, accessed January 26, 2026, [https://blog.fsck.com/2025/12/19/codex-skills/](https://blog.fsck.com/2025/12/19/codex-skills/)  
4. A claude code skill to delegate prompts to codex \- GitHub, accessed January 26, 2026, [https://github.com/skills-directory/skill-codex](https://github.com/skills-directory/skill-codex)  
5. Freesound | Get Started | Postman API Network, accessed January 26, 2026, [https://www.postman.com/api-evangelist/freesound/collection/m2ux9lu/freesound](https://www.postman.com/api-evangelist/freesound/collection/m2ux9lu/freesound)  
6. An Introduction to Freesound \- Creative Commons Open Source, accessed January 26, 2026, [https://opensource.creativecommons.org/blog/entries/freesound-intro/](https://opensource.creativecommons.org/blog/entries/freesound-intro/)  
7. Freesound \- Wikipedia, accessed January 26, 2026, [https://en.wikipedia.org/wiki/Freesound](https://en.wikipedia.org/wiki/Freesound)  
8. Freesound API documentation, accessed January 26, 2026, [https://freesound.org/docs/api/](https://freesound.org/docs/api/)  
9. Freesound \- Nuno Trocado, accessed January 26, 2026, [https://nunotrocado.com/freesound/](https://nunotrocado.com/freesound/)  
10. MTG/freesound-python: python client for the freesound API \- GitHub, accessed January 26, 2026, [https://github.com/MTG/freesound-python](https://github.com/MTG/freesound-python)  
11. Freesound \- Raycast Store, accessed January 26, 2026, [https://www.raycast.com/j3lte/freesound](https://www.raycast.com/j3lte/freesound)  
12. freesound-python/freesound.py at master · MTG/freesound-python, accessed January 26, 2026, [https://github.com/MTG/freesound-python/blob/master/freesound.py](https://github.com/MTG/freesound-python/blob/master/freesound.py)  
13. Resources — Freesound API documentation, accessed January 26, 2026, [https://freesound.org/docs/api/resources\_apiv2.html](https://freesound.org/docs/api/resources_apiv2.html)  
14. Downloading Files from URLs in Python | by ryan \- Medium, accessed January 26, 2026, [https://medium.com/@ryan\_forrester\_/downloading-files-from-urls-in-python-f644e04a0b16](https://medium.com/@ryan_forrester_/downloading-files-from-urls-in-python-f644e04a0b16)  
15. Finding the root of a project with pathlib \- Everyday Superpowers, accessed January 26, 2026, [https://everydaysuperpowers.dev/articles/finding-the-root-of-a-project-with-pathlib/](https://everydaysuperpowers.dev/articles/finding-the-root-of-a-project-with-pathlib/)  
16. Python \- Get path of root project structure \- Stack Overflow, accessed January 26, 2026, [https://stackoverflow.com/questions/25389095/python-get-path-of-root-project-structure](https://stackoverflow.com/questions/25389095/python-get-path-of-root-project-structure)  
17. The Freesound API: Advances in Audio Search and Retrieval, accessed January 26, 2026, [https://repositori.upf.edu/items/d63a1a4e-5017-4aaf-8875-0c1fc5c1a814](https://repositori.upf.edu/items/d63a1a4e-5017-4aaf-8875-0c1fc5c1a814)  
18. Get the Root Project Directory Path in Python \- Stack Abuse, accessed January 26, 2026, [https://stackabuse.com/bytes/get-the-root-project-directory-path-in-python/](https://stackabuse.com/bytes/get-the-root-project-directory-path-in-python/)  
19. How to directly download files without oAuth \- Google Groups, accessed January 26, 2026, [https://groups.google.com/g/freesound-api/c/8qQyjHQ8H4g](https://groups.google.com/g/freesound-api/c/8qQyjHQ8H4g)  
20. Freesound OAuth2 authentication fails \- Stack Overflow, accessed January 26, 2026, [https://stackoverflow.com/questions/28252727/freesound-oauth2-authentication-fails](https://stackoverflow.com/questions/28252727/freesound-oauth2-authentication-fails)  
21. codex-cli-bridge \- Claude Skill | MCP Hub, accessed January 26, 2026, [https://www.aimcp.info/skills/d2b7be4c-81b9-42ee-b9e7-3c17e6abb2b8](https://www.aimcp.info/skills/d2b7be4c-81b9-42ee-b9e7-3c17e6abb2b8)